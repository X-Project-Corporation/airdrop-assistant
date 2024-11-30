import { formatDistance, subMonths } from 'date-fns';
import Table from 'cli-table3';
import ora from 'ora';
import { Logger } from '../utils/logger.js';
import { EnhancedCsvWriter } from '../utils/csv-writer.js';
import { CONFIG } from '../config.js';
import { join } from "path";
import { BatchProcessor } from '../utils/batch-processor.js';
import chalk from "chalk";

export class DiamondHandsAnalyzer {
    constructor(solanaService, cacheManager) {
        this.solanaService = solanaService;
        this.cacheManager = cacheManager;
        this.csvWriter = null;
        this.stats = {
            startTime: Date.now(),
            processed: 0,
            eligible: 0,
            errors: 0
        };
        this.spinner = ora();
        this.batchProcessor = new BatchProcessor(50, CONFIG.CONCURRENT_LIMIT); // Process 50 holders at a time
    }

    async analyze() {
        try {
            await Logger.showWelcome();

            this.spinner.start('Fetching KOKO holders...');
            const holders = await this.solanaService.getAllHolders();
            this.spinner.succeed(`Found ${holders.length} holders with >${CONFIG.MIN_TOKENS.toLocaleString()} KOKO`);

            const timestamp = new Date().toISOString().split('T')[0];
            this.csvWriter = new EnhancedCsvWriter(
                join(CONFIG.OUTPUT_DIR, `koko_diamond_hands_${timestamp}.csv`)
            );

            this.spinner.start('Analyzing holder histories...');

            let totalEligibleKoko = 0;
            const eligibleHolders = [];

            // Process holders in batches
            const processBatch = async (holder) => {
                try {
                    // Check cache first
                    const cachedAnalysis = await this.cacheManager.get(holder.owner);
                    let analysis;

                    if (cachedAnalysis) {
                        analysis = cachedAnalysis;
                    } else {
                        analysis = await this.solanaService.analyzeWallet(holder.owner, holder.amount);
                        if (analysis) {
                            await this.cacheManager.set(holder.owner, analysis);
                        }
                    }

                    if (!analysis) return null;

                    if (analysis.isEligible) {
                        eligibleHolders.push({ ...holder, ...analysis });
                        totalEligibleKoko += holder.amount;
                        this.stats.eligible++;
                    }

                    await this.updateCsvRecord(holder, analysis);
                    this.stats.processed++;

                    // Update progress less frequently to reduce memory pressure
                    if (this.stats.processed % 10 === 0) {
                        this.spinner.text = `Analyzing holders: ${this.stats.processed}/${holders.length} | Eligible: ${this.stats.eligible}`;
                    }

                    return analysis;
                } catch (error) {
                    this.stats.errors++;
                    Logger.error(`Error analyzing ${holder.owner}:`, error);
                    return null;
                }
            };

            // Process all holders in batches
            await this.batchProcessor.process(holders, processBatch);

            // Update airdrop shares
            if (totalEligibleKoko > 0) {
                await this.updateAirdropShares(totalEligibleKoko);
            }

            this.spinner.succeed('Analysis complete!');
            await this.displayResults(eligibleHolders, totalEligibleKoko);

        } catch (error) {
            this.spinner.fail('Analysis failed!');
            Logger.error('Fatal error:', error);
            throw error;
        }
    }

    async updateCsvRecord(holder, analysis) {
        return this.csvWriter.updateRecord(holder.owner, {
            status: analysis.isEligible ? '💎 ELIGIBLE' : '❌ INELIGIBLE',
            owner: holder.owner,
            currentAmount: holder.amount.toLocaleString(),
            maxHeld: analysis.maxHeld.toLocaleString(),
            airdropShare: analysis.isEligible ? '0' : 'N/A',
            holdingDays: analysis.holdingDays,
            firstAcquired: analysis.firstAcquired?.toISOString() || 'Unknown',
            everSold: analysis.hasSold ? '❌ YES' : '✅ NO',
            reason: analysis.reason,
            verdict: analysis.isEligible ? '✅ YES' : '❌ NO'
        });
    }

    async updateAirdropShares(totalEligibleKoko) {
        const batchSize = 1000;
        const records = Array.from(this.csvWriter.records.values());

        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);

            batch.forEach(record => {
                if (record.status === '💎 ELIGIBLE') {
                    const amount = parseFloat(record.currentAmount.replace(/,/g, ''));
                    record.airdropShare = ((amount / totalEligibleKoko) * 100).toFixed(4);
                }
            });

            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
        }

        await this.csvWriter.flush();
    }

    async analyzeHolder(holder) {
        const transactions = await this.solanaService.getTransactionHistory(holder.owner);
        const threeMonthsAgo = subMonths(new Date(), CONFIG.MONTHS_REQUIRED);

        let firstAcquired = null;
        let maxHeld = holder.amount;
        let hasSold = false;

        for (const tx of transactions) {
            const changes = this.analyzeTransaction(tx, holder.owner);

            if (changes.acquired && (!firstAcquired || changes.date < firstAcquired)) {
                firstAcquired = changes.date;
            }

            if (changes.sold) {
                hasSold = true;
                break;
            }

            if (changes.amount > maxHeld) {
                maxHeld = changes.amount;
            }
        }

        const holdingDays = firstAcquired ?
            Math.floor((Date.now() - firstAcquired.getTime()) / (1000 * 60 * 60 * 24)) :
            0;

        const isEligible =
            holder.amount >= CONFIG.MIN_TOKENS &&
            firstAcquired &&
            !hasSold &&
            holdingDays >= (CONFIG.MONTHS_REQUIRED * 30);

        return {
            isEligible,
            firstAcquired,
            maxHeld,
            hasSold,
            holdingDays,
            reason: this.getStatusReason(holder, { firstAcquired, hasSold, holdingDays })
        };
    }

    analyzeTransaction(tx, walletAddress) {
        const result = {
            acquired: false,
            sold: false,
            date: new Date(tx.blockTime * 1000),
            amount: 0
        };

        const preBalance = tx.meta?.preTokenBalances?.find(b =>
            b.owner === walletAddress &&
            b.mint === CONFIG.KOKO_TOKEN
        );

        const postBalance = tx.meta?.postTokenBalances?.find(b =>
            b.owner === walletAddress &&
            b.mint === CONFIG.KOKO_TOKEN
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

    getStatusReason(holder, analysis) {
        if (holder.amount < CONFIG.MIN_TOKENS) {
            return `Insufficient balance (${holder.amount.toLocaleString()} < ${CONFIG.MIN_TOKENS.toLocaleString()})`;
        }
        if (holder.amount > CONFIG.MAX_TOKENS) {
            return `Balance exceeds maximum limit (${holder.amount.toLocaleString()} > ${CONFIG.MAX_TOKENS.toLocaleString()})`;
        }
        if (analysis.hasSold) {
            return 'Has sold KOKO in the past';
        }
        if (!analysis.firstAcquired) {
            return 'No acquisition history found';
        }
        if (analysis.holdingDays < (CONFIG.MONTHS_REQUIRED * 30)) {
            return `Insufficient holding time (${analysis.holdingDays} days < ${CONFIG.MONTHS_REQUIRED * 30} days)`;
        }
        return 'Meets all eligibility criteria';
    }

    async displayResults(eligibleHolders, totalEligibleKoko) {
        // Create summary table
        const summaryTable = new Table({
            style: { head: ['cyan'], border: ['dim'] },
            head: ['Metric', 'Value']
        });

        summaryTable.push(
            ['💎 Eligible Diamond Hands', chalk.green(eligibleHolders.length.toString())],
            ['🪙 Total Eligible KOKO', chalk.yellow(totalEligibleKoko.toLocaleString())],
            ['📈 Average Eligible Holding', chalk.magenta((totalEligibleKoko / eligibleHolders.length).toLocaleString())],
            ['⏱️ Analysis Duration', chalk.cyan(formatDistance(Date.now(), this.stats.startTime))],
            ['⚠️ Errors Encountered', chalk.red(this.stats.errors.toString())]
        );

        console.log(chalk.cyan('\n📊 Analysis Summary\n'));
        console.log(summaryTable.toString());

        // Create top holders table
        const holdersTable = new Table({
            style: { head: ['cyan'], border: ['dim'] },
            head: ['Rank', 'Address', 'KOKO Amount', 'Airdrop Share', 'Days Holding']
        });

        eligibleHolders
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10)
            .forEach((holder, index) => {
                holdersTable.push([
                    chalk.yellow(`#${index + 1}`),
                    chalk.blue(holder.owner),
                    chalk.green(holder.amount.toLocaleString()),
                    chalk.magenta(((holder.amount / totalEligibleKoko) * 100).toFixed(4) + '%'),
                    chalk.cyan(holder.holdingDays)
                ]);
            });

        console.log(chalk.cyan('\n🏆 Top 10 Diamond Hands\n'));
        console.log(holdersTable.toString());

        Logger.success('\nFull results exported to CSV on Desktop');
        console.log('\n' + chalk.dim('━'.repeat(process.stdout.columns)));
    }
}