let { parse } = require('@vue/compiler-sfc');
module.exports = (code) => {
    const ast = parse(code, { filename: String(+new Date()) }).descriptor;
    return ast
}