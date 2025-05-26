const fs = require("fs");

function parseLessVars(filePath) {
    if (!filePath) {
        filePath = 'uikit.vars.less';
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    let variables = {};

    content.split('\n').forEach(line => {
        const match = line.match(/@([\w-]+)\s*:\s*(.+);/);
        if (match) variables[`@${match[1]}`] = match[2].trim();
    });
    return variables;
}
module.exports = parseLessVars;