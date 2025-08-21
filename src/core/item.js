'use strict';

class Item {
    constructor(name, path, type, size, extension) {
        this.name = name;
        this.path = path;
        this.type = type;
        this.size = size;
        this.extension = extension;
    }

    isGif() {
        return this.extension.toLowerCase() === '.gif';
    }
}

module.exports = Item;
