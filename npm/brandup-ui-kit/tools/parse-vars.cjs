const fs = require("fs");

function parseLessVars(url) {
    const content = fs.readFileSync(url, 'utf-8');
    let variables = {};

    content.split('\n').forEach(line => {
        const match = line.match(/@(\w+):\s*(.+);/);
        if (match) variables[`@${match[1]}`] = match[2].trim();
    });

    return variables;
}

module.exports = parseLessVars;