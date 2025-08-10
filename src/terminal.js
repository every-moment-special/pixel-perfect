class Terminal {
    constructor() {
        this.width = process.stdout.columns;
        this.height = process.stdout.rows;
    }
}

module.exports = Terminal;
