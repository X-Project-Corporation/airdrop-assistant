import {Connection, PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import pLimit from 'p-limit';
import {CONFIG} from '../config.js';
import {Logger} from '../utils/logger.js';

export class SolanaService {
    constructor(cacheManager) {
        this.connection = new Connection(CONFIG.RPC_ENDPOINT, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });
        this.mintPubkey = new PublicKey(CONFIG.KOKO_TOKEN);
        this.limiter = pLimit(CONFIG.CONCURRENT_LIMIT);
        this.processedWallets = new Set();
        this.cacheManager = cacheManager;
        this.retryLimit = 3;
        this.retryDelay = 2000;
    }

    async getAllHolders() {
        let holders = await this.cacheManager.get('all_holders');
        if (holders) {
            Logger.info('Using cached holders list');
            return holders;
        }

        try {
            holders = await this.fetchHoldersWithRetry();
            await this.cacheManager.set('all_holders', holders);
            return holders;
        } catch (error) {
            Logger.error('Error fetching holders:', error);
            throw error;
        }
    }

    async fetchHoldersWithRetry(attempt = 1) {
        try {
            const accounts = await this.connection.getParsedProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {dataSize: 165},
                        {memcmp: {offset: 0, bytes: this.mintPubkey.toBase58()}}
                    ]
                }
            );

            return accounts
                .filter(acc => {
                    const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
                    return amount >= CONFIG.MIN_TOKENS;
                })
                .map(acc => ({
                    owner: acc.account.data.parsed.info.owner,
                    amount: acc.account.data.parsed.info.tokenAmount.uiAmount
                }));
        } catch (error) {
            if (attempt < this.retryLimit) {
                Logger.warn(`Retry attempt ${attempt} for fetchHolders`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                return this.fetchHoldersWithRetry(attempt + 1);
            }
            throw error;
        }
    }

    async getTransactionHistory(wallet) {
        const cacheKey = `tx_history_${wallet}`;
        const cachedHistory = await this.cacheManager.get(cacheKey);
        if (cachedHistory) {
            return cachedHistory;
        }

        try {
            const pubKey = new PublicKey(wallet);
            const transactions = await this.fetchTransactionsWithRetry(pubKey);

            // Only cache if we got meaningful results
            if (transactions.length > 0) {
                await this.cacheManager.set(cacheKey, transactions);
            }

            return transactions;
        } catch (error) {
            Logger.error(`Error fetching history for ${wallet}:`, error);
            return [];
        }
    }

    async fetchTransactionsWithRetry(pubKey, attempt = 1) {
        try {
            const allSignatures = await this.fetchAllSignatures(pubKey);
            const transactions = await this.fetchTransactionDetails(allSignatures);

            return this.filterRelevantTransactions(transactions);
        } catch (error) {
            if (attempt < this.retryLimit) {
                Logger.warn(`Retry attempt ${attempt} for wallet ${pubKey.toString()}`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                return this.fetchTransactionsWithRetry(pubKey, attempt + 1);
            }
            throw error;
        }
    }

    async fetchAllSignatures(pubKey) {
        let allSignatures = [];
        let options = {limit: 1000};

        while (true) {
            const signatures = await this.limiter(() =>
                this.connection.getSignaturesForAddress(pubKey, options)
            );

            if (signatures.length === 0) break;

            // Extract only necessary data to save memory
            allSignatures.push(...signatures.map(sig => ({
                signature: sig.signature,
                blockTime: sig.blockTime
            })));

            if (signatures.length < 1000) break;
            options.before = signatures[signatures.length - 1].signature;

            // Add small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return allSignatures.sort((a, b) => b.blockTime - a.blockTime);
    }

    async fetchTransactionDetails(signatures) {
        // Process in smaller batches to manage memory
        const batchSize = 50;
        let allTransactions = [];

        for (let i = 0; i < signatures.length; i += batchSize) {
            const batch = signatures.slice(i, i + batchSize);
            const batchPromises = batch.map(sig =>
                this.limiter(() =>
                    this.connection.getParsedTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    }).catch(() => null)
                )
            );

            const batchResults = await Promise.all(batchPromises);
            allTransactions.push(...batchResults.filter(tx => tx !== null));

            // Allow garbage collection between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return allTransactions;
    }

    filterRelevantTransactions(transactions) {
        return transactions.filter(tx => {
            const tokenBalances = [
                ...(tx.meta?.preTokenBalances || []),
                ...(tx.meta?.postTokenBalances || [])
            ];

            return tokenBalances.some(balance =>
                balance.mint === this.mintPubkey.toString()
            );
        });
    }

    async analyzeWallet(wallet, currentBalance) {
        try {
            if (this.processedWallets.has(wallet)) {
                return null;
            }
            this.processedWallets.add(wallet);

            const cacheKey = `analysis_${wallet}`;
            const cachedAnalysis = await this.cacheManager.get(cacheKey);
            if (cachedAnalysis) {
                return cachedAnalysis;
            }

            const transactions = await this.getTransactionHistory(wallet);
            const analysis = await this.processWalletTransactions(wallet, currentBalance, transactions);

            if (analysis.isEligible || transactions.length > 0) {
                await this.cacheManager.set(cacheKey, analysis);
            }

            return analysis;
        } catch (error) {
            Logger.error(`Error analyzing ${wallet}:`, error);
            return {
                isEligible: false,
                reason: 'Error during analysis',
                firstAcquired: null,
                maxHeld: currentBalance,
                hasSold: false,
                holdingDays: 0
            };
        }
    }

    async processWalletTransactions(wallet, currentBalance, transactions) {
        if (transactions.length === 0) {
            return {
                isEligible: false,
                reason: 'No transaction history found',
                firstAcquired: null,
                maxHeld: currentBalance,
                hasSold: false,
                holdingDays: 0
            };
        }

        let firstAcquired = null;
        let maxHeld = currentBalance;
        let hasSold = false;

        for (const tx of transactions) {
            const {acquired, sold, amount, date} = this.analyzeTransaction(tx, wallet);

            maxHeld = Math.max(maxHeld, amount);

            if (acquired && (!firstAcquired || date < firstAcquired)) {
                firstAcquired = date;
            }

            if (sold) {
                hasSold = true;
                break;
            }
        }

        const holdingDays = firstAcquired ?
            Math.floor((Date.now() - firstAcquired.getTime()) / (1000 * 60 * 60 * 24)) :
            0;

        const isEligible =
            currentBalance >= CONFIG.MIN_TOKENS &&
            currentBalance <= CONFIG.MAX_TOKENS &&
            firstAcquired &&
            !hasSold &&
            holdingDays >= (CONFIG.MONTHS_REQUIRED * 30);

        return {
            isEligible,
            reason: this.getEligibilityReason(currentBalance, hasSold, firstAcquired, holdingDays),
            firstAcquired,
            maxHeld,
            hasSold,
            holdingDays
        };
    }

    analyzeTransaction(tx, wallet) {
        const result = {
            acquired: false,
            sold: false,
            date: new Date(tx.blockTime * 1000),
            amount: 0
        };

        if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
            return result;
        }

        const preBalance = tx.meta.preTokenBalances.find(b =>
            b.mint === this.mintPubkey.toString() &&
            b.owner === wallet
        );

        const postBalance = tx.meta.postTokenBalances.find(b =>
            b.mint === this.mintPubkey.toString() &&
            b.owner === wallet
        );

        if (preBalance && postBalance) {
            const pre = Number(preBalance.uiTokenAmount.amount);
            const post = Number(postBalance.uiTokenAmount.amount);

            result.acquired = post > pre;
            result.sold = post < pre;
            result.amount = post;
        }

        return result;
    }

    getEligibilityReason(currentBalance, hasSold, firstAcquired, holdingDays) {
        if (currentBalance < CONFIG.MIN_TOKENS) {
            return `Insufficient balance (${currentBalance.toLocaleString()} < ${CONFIG.MIN_TOKENS.toLocaleString()})`;
        }
        if (currentBalance > CONFIG.MAX_TOKENS) {
            return `Balance exceeds maximum limit (${currentBalance.toLocaleString()} > ${CONFIG.MAX_TOKENS.toLocaleString()})`;
        }
        if (hasSold) {
            return 'Has sold KOKO in the past';
        }
        if (!firstAcquired) {
            return 'Unable to determine first acquisition';
        }
        if (holdingDays < (CONFIG.MONTHS_REQUIRED * 30)) {
            return `Insufficient holding time (${holdingDays} days < ${CONFIG.MONTHS_REQUIRED * 30} days)`;
        }
        return 'Meets all eligibility criteria';
    }
}