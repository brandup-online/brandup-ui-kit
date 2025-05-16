const fs = require("fs");

function parseLessVars() {
    const content = fs.readFileSync('./node_modules/@brandup/ui-kit/source/uikit.vars.less', 'utf8');
    let variables = {};

    content.split('\n').forEach(line => {
        const match = line.match(/@(\w+):\s*(.+);/);
        if (match) variables[`@${match[1]}`] = match[2].trim();
    });

    return variables;
}

module.exports = parseLessVars;