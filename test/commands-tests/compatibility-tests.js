const chai = require('chai');
const chaiFiles = require('chai-files');
const assert = chai.assert;
chai.use(chaiFiles);

const fs = require('fs-extra');
const execute = require('../../packages/aeproject-utils/utils/aeproject-utils.js').aeprojectExecute;

const {
    exec,
    spawn
} = require('promisify-child-process');

const constants = require('../constants.json');
const testFolder = constants.compatibilityTestFolder;
const cliCommands = constants.cliCommands;
const cliCmdOptions = constants.cliCommandsOptions;

const aeConfig = require('aeproject-config');
const nodeConfig = aeConfig.nodeConfiguration;
const compilerConfig = aeConfig.compilerConfiguration;

let executeOptions = {
    cwd: process.cwd() + testFolder
};

const compatibilityCmd = (options) => {
    return new Promise((resolve, reject) => {
        let cmd = `${ cliCommands.AEPROJECT } ${ cliCommands.COMPATIBILITY }`;
        if (options && options.nodeVersion) {
            cmd += ` ${ cliCmdOptions.NODE_VERSION } ${ options.nodeVersion }`;
        }

        if (options && options.compilerVersion) {
            cmd += ` ${ cliCmdOptions.COMPILER_VERSION } ${ options.compilerVersion }`;
        }

        let result = '';
        let log = '';

        let temp = exec(cmd, executeOptions);
        if (temp.stdout) {
            temp.stdout.on('data', async (data) => {
                let str = data.toString('utf8');
                log += str;
                if (str.trim() == 'Running tests...') {
                    result = await exec(cliCommands.DOCKER_PS);
                }
            });
        }

        if (temp.stderr) {
            temp.stderr.on('data', (data) => {
                console.log('err:', data.toString('utf8'));
            });
        }

        temp.on('exit', (code) => {
            if (code !== 0) {
                const msg = `Child process exited with code ${ code }`;
                console.log(msg);
                reject(msg)
            }
            
            if (options && options.logs) {
                resolve(log);
            } else {
                resolve(result);
            }
        });
    });
}

describe('Compatibility tests', async function () {
    let tempCWD = process.cwd();

    before(async function () {
        fs.ensureDirSync(`.${ testFolder }`);
        await execute(constants.cliCommands.INIT, [], executeOptions);
        process.chdir(executeOptions.cwd);
    })

    it('Docker images should be run with "latest" versions', async function () {
        let result = await compatibilityCmd();

        if (result && result.stdout) {
            const isNodeLatestVersion = result.stdout.indexOf(`${ nodeConfig.dockerImage }:latest`) >= 0;
            const isCompilerLatestVersion = result.stdout.indexOf(`${ compilerConfig.dockerImage }:latest`) >= 0;

            assert.isOk(isNodeLatestVersion && isCompilerLatestVersion, 'Node is not running with latest version');
            assert.isOk(isCompilerLatestVersion, 'Compiler is not running with latest version');
        } else {
            assert.isOk(false, 'Cannot get result of "docker ps" command');
        }
    })

    it('Docker images should be run with "specific" versions', async function () {
        const nodeVersion = 'v5.1.0';
        const compilerVersion = 'v3.1.0';
        
        let result = await compatibilityCmd({ nodeVersion: nodeVersion, compilerVersion: compilerVersion });

        if (result && result.stdout) {
            const isNodeLatestVersion = result.stdout.indexOf(`${ nodeConfig.dockerImage }:${ nodeVersion }`) >= 0;
            const isCompilerLatestVersion = result.stdout.indexOf(`${ compilerConfig.dockerImage }:${ compilerVersion }`) >= 0;

            assert.isOk(isNodeLatestVersion && isCompilerLatestVersion, 'Node is not running with specific version');
            assert.isOk(isCompilerLatestVersion, 'Compiler is not running with specific version');
        } else {
            assert.isOk(false, 'Cannot get result of "docker ps" command');
        }
    })

    it('Tests should be run successfully and should not be running docker images', async function () {
        let result = await compatibilityCmd({ logs: true });

        const isTestsStarted = result.indexOf('Starting Tests');
        const isContractDeployed = result.indexOf('has been deployed');

        assert.isOk(isTestsStarted && isContractDeployed);

        let dockerPSResult = await exec(cliCommands.DOCKER_PS);

        if (dockerPSResult.stdout) {
            const isNodeRunning = dockerPSResult.stdout.indexOf(nodeConfig.dockerImage) >= 0;
            const isCompilerRunning = dockerPSResult.stdout.indexOf(compilerConfig.dockerImage) >= 0;

            assert.isNotOk(isNodeRunning || isCompilerRunning, 'Node or Compiler is running');
        }
    })

    after(async function () {
        process.chdir(tempCWD);
        fs.removeSync(`.${ testFolder }`);
    })
})