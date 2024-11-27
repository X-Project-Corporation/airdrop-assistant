import { createObjectCsvWriter } from 'csv-writer';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export class EnhancedCsvWriter {
    constructor(filepath) {
        mkdirSync(dirname(filepath), { recursive: true });

        this.csvWriter = createObjectCsvWriter({
            path: filepath,
            header: [
                { id: 'status', title: 'Status' },
                { id: 'owner', title: 'Wallet Address' },
                { id: 'currentAmount', title: 'Current KOKO Balance' },
                { id: 'maxHeld', title: 'Maximum Ever Held' },
                { id: 'airdropShare', title: 'Airdrop Share %' },
                { id: 'holdingDays', title: 'Days Holding' },
                { id: 'firstAcquired', title: 'First Acquired' },
                { id: 'everSold', title: 'Ever Sold' },
                { id: 'reason', title: 'Status Reason' },
                { id: 'verdict', title: 'Airdrop Eligible' }
            ]
        });

        this.records = new Map();
        this.isWriting = false;
        this.writeQueue = [];
    }

    async updateRecord(key, data) {
        this.records.set(key, { ...this.records.get(key), ...data });
        await this.scheduleWrite();
    }

    async scheduleWrite() {
        if (this.isWriting) {
            return new Promise(resolve => this.writeQueue.push(resolve));
        }

        this.isWriting = true;
        try {
            await this.csvWriter.writeRecords(Array.from(this.records.values()));
        } finally {
            this.isWriting = false;
            while (this.writeQueue.length > 0) {
                this.writeQueue.shift()();
            }
        }
    }
}