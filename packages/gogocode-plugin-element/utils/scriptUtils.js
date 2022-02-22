const path = require('path');
const fs = require('fs');
const prettier = require('prettier');

function toCamelCase(str) {
    return str.replace(/-([a-z])/g, function (g) {
        return g[1].toUpperCase();
    });
}

function findAnyOf(scriptAst, rules) {
    for (let i = 0; i < rules.length; ++i) {
        const res = scriptAst.find(rules[i]);
        if (res.length) {
            return res;
        }
    }
    return false;
}

function addCodeToLifeCycle(scriptAst, lifeCycle, code) {
    const hasLifeCycle = scriptAst.has(`${lifeCycle}() {}`);

    if (hasLifeCycle) {
        scriptAst.replace(
            `
    export default {
      ${lifeCycle}() {
        $$$2
      },
      $$$1
    }`,
            `
    export default {
      $$$1,
      ${lifeCycle}() {
        $$$2;
        ${code}
      }
    }`
        );
    } else {
        scriptAst.replace(
            `
      export default {
        $$$1
      }`,
            `
      export default {
        ${lifeCycle}() {
          ${code}
        },
        $$$1
      }
      `
        );
    }
    return scriptAst;
}

function addData(script, kv) {
    const hasData = script.has(`data() {}`);

    const kvStr = Object.keys(kv)
        .map((key) => (key === kv[key] ? key : `${key}: ${kv[key]}`))
        .join(',');

    if (hasData) {
        script.replace(
            `
    export default {
      data() {
        return {
            $$$1
        }
      },
      $$$2
    }`,
            `
    export default {
        data() {
            return {
                $$$1,
                ${kvStr},
            }
        },
        $$$2
    }`
        );
    } else {
        script.replace(
            `
      export default {
        $$$1
      }`,
            `
      export default {
        data() {
          return {
            ${kvStr},
          }
        },
        $$$1
      }
      `
        );
    }
    return script;
}

function addComponents(script, kv) {
    const hasComponents = script.has(`components: {}`);

    const kvStr = Object.keys(kv)
        .map((key) => (key === kv[key] ? key : `${key}: ${kv[key]}`))
        .join(',');

    if (hasComponents) {
        script.replace(
            `
    export default {
      components: {
        $$$1
      },
      $$$2
    }`,
            `
    export default {
      components: {
        $$$1,
        ${kvStr},
      },
      $$$2
    }`
        );
    } else {
        script.replace(
            `
      export default {
        $$$1
      }`,
            `
      export default {
        components: {
          ${kvStr},
        },
        $$$1
      }
      `
        );
    }
    return script;
}

function addMethod(scriptAst, methodCode) {
    // 如果原本没有methods属性，就连method一起插入
    if (!scriptAst.has(`methods: {}`)) {
        scriptAst.replace(
            `export default {
        $$$1
      }`,
            `export default {
        methods: {
        },
        $$$1
      }`
        );
    }
    scriptAst.replace(
        `
  export default {
    $$$1,
    methods: {
      $$$2
    }
  }`,
        `
  export default {
    $$$1,
    methods: {
      ${methodCode},
      $$$2
    }
  }`
    );
    return scriptAst;
}

function getVueName(scriptAst) {
    try {
        const match = scriptAst.find('import $_$1 from "vue"').match;
        let vueName = 'Vue';
        if (match && match[1] && match[1].length > 0 && match[1][0] && match[1][0].value) {
            vueName = match[1][0].value;
        }
        return vueName;
    } catch (error) {
        return 'Vue';
    }
}

function addVueImport(scriptAst) {
    if (scriptAst.has(`import $_$ from 'vue';`)) {
        scriptAst.replace(`import $_$ from 'vue';`, `import * as $_$ from 'vue';`);
    }

    if (!scriptAst.has(`import * as $_$ from 'vue';`)) {
        scriptAst.prepend(`import * as Vue from 'vue';`);
    }

    return scriptAst;
}

function withoutExt(p) {
    return p.replace(/\.[^/.]+$/, '');
}

function addUtils($, extFunCode, outRootPath, outFilePath, fileName) {
    const importFile = 'utils' + path.sep + (fileName || 'gogocodeTransfer.js');
    let outRootDirPath = outRootPath.indexOf('.') > -1 ? path.dirname(outRootPath) : outRootPath;

    const inputPath = path.resolve(outRootDirPath, importFile);
    if (!fs.existsSync(inputPath)) {
        inputPath.split(path.sep).reduce((prev, curr) => {
            if (prev && !prev.endsWith(importFile) && fs.existsSync(prev) === false) {
                fs.mkdirSync(prev);
            }
            return prev + path.sep + curr;
        });
    }
    const code = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, 'utf-8') : '';
    let ast = $(code);
    if (!ast.has(extFunCode)) {
        ast.append('program.body', extFunCode);
        try {
            const prettierOutPut = prettier.format(ast.generate(), {
                trailingComma: 'es5',
                tabWidth: 2,
                semi: false,
                singleQuote: true,
                printWidth: 80,
                parser: 'typescript',
            });
            fs.writeFileSync(inputPath, prettierOutPut);
        } catch (ex) {
            console.log('error ', ex);
        }
    }
    let modulePath = withoutExt(path.relative(path.dirname(outFilePath), inputPath));

    return modulePath === 'gogocodeTransfer' ? './gogocodeTransfer' : modulePath.replace(/\\/g, '/');
}

function addMixin(scriptAst, mixin) {
    const minin = `export default {
        mixins: $$$1,
      $$$2
    }`;
    if (scriptAst.has(minin)) {
        if (!scriptAst.has(`mixins:[ ${mixin},$$$ ]`)) {
            scriptAst.replace(`mixins:[ $$$ ]`, `mixins:[ $$$ ,${mixin}]`);
        }
    } else {
        scriptAst.replace(
            `
    export default {        
      $$$
    }`,
            `
    export default {
        mixins:[ ${mixin} ],
      $$$      
    }`
        );
    }
    return scriptAst;
}
/**
 * 强制替换ast对象，避免ast结构异常情况出现
 * @param {*} $
 * @param {*} ast
 * @param {*} selector
 * @param {*} replacer
 */
function forceReplace($, ast, selector, replacer) {
    ast.replaceBy($(ast.generate()).replace(selector, replacer));
}

module.exports = {
    toCamelCase,
    findAnyOf,
    addCodeToLifeCycle,
    addMethod,
    addComponents,
    addData,
    getVueName,
    addVueImport,
    addUtils,
    forceReplace,
    addMixin,
};
