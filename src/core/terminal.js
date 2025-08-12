class Terminal {
    constructor() {
        this.width = process.stdout.columns || 80;
        this.height = process.stdout.rows || 24;

        // Keep dimensions in sync with the actual terminal on resize
        if (process.stdout && typeof process.stdout.on === 'function') {
            process.stdout.on('resize', () => {
                this.width = process.stdout.columns || this.width || 80;
                this.height = process.stdout.rows || this.height || 24;
            });
        }
    }
}

module.exports = Terminal;
