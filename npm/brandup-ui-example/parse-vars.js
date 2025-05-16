const fs = require('fs');

module.exports = function parseLessVariablesSync(url) {
    const content = fs.readFileSync(url, 'utf8');
    let variables = {};

    content.split('\n').forEach(line => {
        const match = line.match(/@(\w+):\s*(.+);/);
        if (match) variables[`@${match[1]}`] = match[2].trim();
    });

    return variables;
};