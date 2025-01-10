"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DownloadQueue {
    constructor(options) {
        this.finalized = false;
        this.idle = true;
        this.jobs = [];
        this.options = options;
    }
    /**
     * Add one or more jobs and start working if needed
     */
    addJob(...jobs) {
        this.jobs.push(...jobs);
        if (this.idle) {
            this.tick();
        }
        return this;
    }
    /**
     * Marks the instance as finalized, meaning that no more jobs can be added.
     * Once all the existing jobs complete, the onComplete callback will be
     * called. In other words, here you tell the instance that you have no more
     * jobs for it anf it can finish when all pending jobs (if any) are completed.
     */
    finalize() {
        if (this.finalized) {
            throw new Error("finalize() called on already finalized instance");
        }
        this.finalized = true;
        if (this.idle) {
            this.tick();
        }
    }
    tick() {
        let completed = 0;
        let running = 0;
        for (const job of this.jobs) {
            if (job.completed) {
                completed += 1;
                continue;
            }
            if (job.running) {
                running += 1;
                continue;
            }
            if (running < this.options.parallelJobs) {
                running += 1;
                job.running = true;
                job.completed = false;
                job.worker().then(() => {
                    job.running = false;
                    job.completed = true;
                    this.tick();
                });
            }
        }
        this.options.onProgress(this.jobs);
        this.idle = running === 0;
        if (this.idle && completed === this.jobs.length && this.finalized) {
            this.options.onComplete(this.jobs);
        }
    }
    ;
}
exports.default = DownloadQueue;
