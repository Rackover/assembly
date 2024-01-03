const fs = require('fs');
const path = require('path');

const BASE_PATH = `./programs`;

module.exports = {
    captureFunctional: function(author, name, string, bytecode)
    {
        fs.mkdirSync(BASE_PATH, {recursive: true});
        fs.writeFileSync(path.join(BASE_PATH, `${name}_${author}.src`), `# Author: ${author}\n${string}`);
        fs.writeFileSync(path.join(BASE_PATH, `${name}_${author}.bin`), bytecode);
    },
    captureNonFunctional: function(author, name, string, err)
    {
        const folder = path.join(BASE_PATH, 'invalid');
        fs.mkdirSync(folder, {recursive: true});
        fs.writeFileSync(path.join(BASE_PATH, `${name}_${author}.src`), `# Author: ${author}\n# ${err}\n${string}`);
    }
}