const fs = require('fs');
const less = require('less');

module.exports = async function parseLessVariables(url) {
    const content = fs.readFileSync(url, 'utf8');
    const parsed = await less.parse(content, { filename: url });

    const variables = {};

    parsed.rules.forEach(rule => {
        if (rule.variable) {
            const varName = rule.name.replace('@', '');
            variables[varName] = rule.value.toCSS().trim();
        }
    });

    return variables;
};