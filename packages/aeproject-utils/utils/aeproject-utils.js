require = require('esm')(module /*, options */) // use to handle es6 import/export 
let axios = require('axios');
const fs = require('fs');
const path = require('path')
const AeSDK = require('@aeternity/aepp-sdk');
const Universal = AeSDK.Universal;
const Node = AeSDK.Node;
let rgx = /^include\s+\"([\d\w\/\.\-\_]+)\"/gmi;
let dependencyPathRgx = /"([\d\w\/\.\-\_]+)\"/gmi;
const mainContractsPathRgx = /.*\//g;
let match;

const config = require('../../aeproject-config/config/config.json');
const {
    printError
} = require('./fs-utils')

const {
    spawn,
    exec
} = require('promisify-child-process');

const COMPILER_URL_POSTFIX = '/compile';

const getClient = async function (network, keypair = config.keypair) {
    let client;
    let internalUrl = network.url;
    if (network.url.includes("localhost")) {
        internalUrl = internalUrl + "/internal"
    }

    let node = await Node({
        url: network.url,
        internalUrl: internalUrl,
        forceCompatibility: true
    })

    await handleApiError(async () => {
        client = await Universal({
            nodes: [{
                name: 'ANY_NAME',
                instance: node
            }],
            accounts: [AeSDK.MemoryAccount({
                keypair
            })],
            nativeMode: true,
            networkId: network.networkId,
            compilerUrl: network.compilerUrl,
            forceCompatibility: true
        })
    });

    return client;
}

const getNetwork = (network, networkId) => {
    if (networkId) {
        const customNetwork = createCustomNetwork(network, networkId)
        return customNetwork;
    }
    const networks = {
        local: {
            url: config.localhostParams.url,
            networkId: config.localhostParams.networkId
        },
        testnet: {
            url: config.testNetParams.url,
            networkId: config.testNetParams.networkId
        },
        mainnet: {
            url: config.mainNetParams.url,
            networkId: config.mainNetParams.networkId
        }
    };

    const result = networks[network] != undefined ? networks[network] : createCustomNetwork(network, networkId);

    return result
};

const createCustomNetwork = (network, networkId) => {
    if (network.includes('local') || networkId == undefined) {
        throw new Error('Both network and networkId should be passed')
    }
    const customNetork = {
        url: network,
        networkId: networkId
    }

    return customNetork;
}

const handleApiError = async (fn) => {
    try {

        return await fn()
    } catch (e) {
        console.log(e)
        const response = e.response
        logApiError(response && response.data ? response.data.reason : e)
        process.exit(1)
    }
};

function logApiError (error) {
    printError(`API ERROR: ${ error }`)
}

const sleep = (ms) => {
    var start = Date.now();
    while (true) {
        var clock = (Date.now() - start);
        if (clock >= ms) break;
    }
}

const aeprojectExecute = async (command, args = [], options = {}) => {
    return execute("aeproject", command, args, options)
}

const execute = async (cli, command, args = [], options = {}) => {

    try {
        const child = await spawn(cli, [command, ...args], options);

        let result = child.stdout.toString('utf8');
        result += child.stderr.toString('utf8');

        return result;
    } catch (e) {
        console.log(e)

        let result = e.stdout ? e.stdout.toString('utf8') : e.message;
        result += e.stderr ? e.stderr.toString('utf8') : e.message;

        return result;
    }
};

const winExec = async (cli, cmd, args = [], options = {}) => {
    try {

        const child = await exec(`${ cli } ${ cmd } ${ args.join(' ') }`, options);

        let result = readSpawnOutput(child);
        result += readErrorSpawnOutput(child);

        return result;
    } catch (e) {
        let result = readSpawnOutput(e);
        result += readErrorSpawnOutput(e);

        return result;
    }
}

const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function readErrorSpawnOutput (spawnResult) {
    if (!spawnResult.stderr || spawnResult.stderr === '') {
        return '';
    }

    const buffMessage = Buffer.from(spawnResult.stderr);
    return '\n' + buffMessage.toString('utf8');
}

function readSpawnOutput (spawnResult) {

    if (!spawnResult || !spawnResult.stdout || spawnResult.stdout === '') {
        return '';
    }

    const buffMessage = Buffer.from(spawnResult.stdout);
    return buffMessage.toString('utf8');
}

async function contractCompile (source, contractPath, compileOptions) {
    let result;
    let options = {
        "file_system": null
    }

    let dependencies = getDependencies(source, contractPath)
    options["file_system"] = dependencies
    let body = {
        code: source,
        options
    };
    const url = normalizeCompilerUrl(compileOptions.compilerUrl);

    result = await axios.post(url, body, options);

    return result;
}

function checkNestedProperty (obj, property) {
    if (!obj || !obj.hasOwnProperty(property)) {
        return false;
    }

    return true;
}

function getDependencies (contractContent, contractPath) {
    let allDependencies = [];
    let dependencyFromContract;
    let dependencyContractContent;
    let dependencyContractPath;
    let actualContract;
    let dependencies = {}

    match = rgx.exec(contractContent)
    if (!match) {
        return dependencies;
    }

    allDependencies = contractContent.match(rgx)
    for (let index = 0; index < allDependencies.length; index++) {
        dependencyFromContract = dependencyPathRgx.exec(allDependencies[index])
        dependencyPathRgx.lastIndex = 0;
        contractPath = mainContractsPathRgx.exec(contractPath)
        mainContractsPathRgx.lastIndex = 0;
        dependencyContractPath = path.resolve(`${ contractPath[0] }/${ dependencyFromContract[1] }`)
        dependencyContractContent = fs.readFileSync(dependencyContractPath, 'utf-8')
        actualContract = getActualContract(dependencyContractContent)
        dependencies[dependencyFromContract[1]] = actualContract;

        Object.assign(dependencies, getDependencies(dependencyContractContent, dependencyContractPath))
    }

    return dependencies;
}

function getActualContract (contractContent) {
    let contentStartIndex = contractContent.indexOf('namespace ');
    let content = contractContent.substr(contentStartIndex);

    return content;
}

function normalizeCompilerUrl (url) {

    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }

    if (!url.endsWith(COMPILER_URL_POSTFIX)) {
        if (url.endsWith('/')) {
            url += COMPILER_URL_POSTFIX.substr(1);
        } else {
            url += COMPILER_URL_POSTFIX
        }
    }

    return url;
}

function capitalize (_string) {
    if (typeof _string !== 'string') return ''
    return _string.charAt(0).toUpperCase() + _string.slice(1)
}

module.exports = {
    config,
    getClient,
    getNetwork,
    handleApiError,
    logApiError,
    sleep,
    aeprojectExecute,
    execute,
    timeout,
    contractCompile,
    checkNestedProperty,
    winExec,
    readSpawnOutput, 
    readErrorSpawnOutput,
    capitalize
}