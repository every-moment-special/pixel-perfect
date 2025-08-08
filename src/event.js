class Event {
    constructor() {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        this.listeners = {};

        process.stdin.on('data', (key) => {
            // Exit on Ctrl+C
            if (key === '\u0003') process.exit();

            const parsed = this.parseKey(key);

            // Always fire the generic "key" event
            this.emit('key', parsed);

            // Fire simple name (e.g. key:a)
            this.emit(`key:${parsed.name}`, parsed);

            // Fire combo name (e.g. key:ctrl+a)
            let combo = [];
            if (parsed.ctrl) combo.push('ctrl');
            if (parsed.alt) combo.push('alt');
            if (parsed.shift) combo.push('shift');
            combo.push(parsed.name);
            this.emit(`key:${combo.join('+')}`, parsed);
        });
    }

    parseKey(key) {
        const code = key.charCodeAt(0);

        // Ctrl + letter
        if (code <= 26) {
            return {
                name: String.fromCharCode(code + 96),
                ctrl: true,
                alt: false,
                shift: false
            };
        }

        // Alt + key (ESC + char)
        if (key.startsWith('\u001b') && key.length === 2) {
            return {
                name: key[1],
                ctrl: false,
                alt: true,
                shift: false
            };
        }

        // Default
        return {
            name: key,
            ctrl: false,
            alt: false,
            shift: key !== key.toLowerCase()
        };
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
}
