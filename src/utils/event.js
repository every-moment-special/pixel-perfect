const { execSync } = require('child_process');

class Event {
    constructor() {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
        }
        process.stdin.setEncoding('utf8');

        try { process.stdin.resume(); } catch (_) {}

        this.listeners = {};
        this.enableMouse();
        this.disableMouse();

        if (process.stdin.isTTY) {
          try { 
            execSync('stty -echo -icanon min 1 time 0', { stdio: 'ignore' }); 
          } catch (_) {}
        }

        // Key Press + Mouse
        process.stdin.on('data', (data) => {
            // Ctrl+C
            if (data === '\u0003') process.exit();

            // Mouse
            if (data.startsWith('\x1b[<')) {
                const mouse = this.parseMouse(data);
                if (mouse) this.emit('mouse', mouse);
                if (mouse?.type === 'down') this.emit('click', mouse);
                return;
            }

            const parsed = this.parseKey(data);

            this.emit('key', parsed);

            this.emit(`key:${parsed.name}`, parsed);

            let combo = [];
            if (parsed.ctrl) combo.push('ctrl');
            if (parsed.alt) combo.push('alt');
            if (parsed.shift) combo.push('shift');
            if (combo.length > 0) {
                combo.push(parsed.name);
                this.emit(`key:${combo.join('+')}`, parsed);
            }
        });

        process.stdout.on('resize', () => {
            this.emit('resize', {
                cols: process.stdout.columns,
                rows: process.stdout.rows
            });
        });

        const restoreEcho = () => { 
            if (process.stdin.isTTY) { 
                try { 
                    execSync('stty sane', { stdio: 'ignore' }); 
                } catch (_) {} 
            } 
        };
        process.on('exit', restoreEcho);
        process.on('SIGINT', () => { restoreEcho(); process.exit(); });
        process.on('SIGTERM', () => { restoreEcho(); process.exit(); });
    }

    enableMouse() {
        // 1000 = click tracking, 1003 = any movement, 1006 = SGR mode
        process.stdout.write('\x1b[?1000;1006;1003h');
    }

    disableMouse() {
        process.stdout.write('\x1b[?1000;1006;1003l');
    }

    parseMouse(seq) {
        // SGR mode: \x1b[<b;x;ym  OR  \x1b[<b;x;yM
        const match = /\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(seq);
        if (!match) return null;

        let [ , btnCode, x, y, state ] = match;
        btnCode = Number(btnCode);
        x = Number(x);
        y = Number(y);

        const isMotion = (btnCode & 32) === 32; // bit 6 set = motion
        const button = btnCode & 0b11; // 0 = left, 1 = middle, 2 = right
        let type;

        if (isMotion) {
            type = 'move';
        } else if (state === 'M') {
            type = 'down';
        } else {
            type = 'up';
        }

        return { x, y, button, type };
    }

    parseKey(key) {
        const arrows = {
            '\u001b[A': 'up',
            '\u001b[B': 'down',
            '\u001b[C': 'right',
            '\u001b[D': 'left',
        };
        const paging = {
            '\u001b[5~': 'pageup',
            '\u001b[6~': 'pagedown',
        };

        if (arrows[key]) {
            return { name: arrows[key], ctrl: false, alt: false, shift: false };
        }
        if (paging[key]) {
            return { name: paging[key], ctrl: false, alt: false, shift: false };
        }

        if (key === '\r' || key === '\n') {
            return { name: 'enter', ctrl: false, alt: false, shift: false };
        }

        if (key === '\u0008' || key === '\u007f') {
            return { name: 'backspace', ctrl: false, alt: false, shift: false };
        }

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

module.exports = Event;
