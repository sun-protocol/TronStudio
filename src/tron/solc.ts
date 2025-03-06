/* eslint-disable @typescript-eslint/no-explicit-any */
import * as path from 'path';
import { constants, promises as fsPromises  } from 'fs';
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

async function downloadFile(url: string, dest: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`network error: ${response.statusText}`);
    }
    await streamPipeline(response.body as any, createWriteStream(dest));
    console.log(`download ${url} to ${dest} success`);
  } catch (error) {
    console.error('download failed', error);
  }
}

async function checkFileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath, constants.F_OK);
        return true;
    } catch (error) {
        return false;
    }
}

export async function loadTronSolc(solcVersion: string) {
  let compilerPath = '';
  let compilerRemotePath = '';
  let longVersion = '';

  if (solcVersion == "0.8.23") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.23/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.23.js"
    );
    longVersion = "0.8.23";
  } else if (solcVersion == "0.8.22") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.22/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.22.js"
    );
    longVersion = "0.8.22";
  } else if (solcVersion == "0.8.21") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.21/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.21.js"
    );
    longVersion = "0.8.21";
  } else if (solcVersion == "0.8.20") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.20/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.20.js"
    );
    longVersion = "0.8.20";
  } else if (solcVersion == "0.8.18") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.18/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.18.js"
    );
    longVersion = "0.8.18";
  } else if (solcVersion == "0.8.11") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.11/solidity-js_0.8.11_Rousseau_v4.4.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.11.js"
    );
    longVersion = "0.8.11";
  } else if (solcVersion == "0.8.7") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.7/solidity-js_0.8.7_Rousseau_v4.4.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.7.js"
    );
    longVersion = "0.8.7";
  } else if (solcVersion == "0.8.6") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.6/solidity-js_0.8.6_Bacon_v4.3.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.6.js"
    );
    longVersion = "0.8.6";
  } else if (solcVersion == "0.7.7") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.7.7/solidity-js_0.7.7_Bacon_v4.3.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.7.7.js"
    );
    longVersion = "0.7.7";
  } else if (solcVersion == "0.6.13") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.6.13/solidity-js_0.6.13_Bacon_v4.3.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.6.13.js"
    );
    longVersion = "0.6.13";
  } else if (solcVersion == "0.5.18") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.18/solidity-js_0.5.18_Bacon_v4.3.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.18.js"
    );
    longVersion = "0.5.18";
  } else if (solcVersion == "0.8.0") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.0/solidity-js_0.8.0_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.0.js"
    );
    longVersion = "0.8.0";
  } else if (solcVersion == "0.7.6") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.7.6/solidity-js_0.7.6_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.7.6.js"
    );
    longVersion = "0.7.6";
  } else if (solcVersion == "0.7.0") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.7.0/solidity-js_0.7.0_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.7.0.js"
    );
    longVersion = "0.7.0";
  } else if (solcVersion == "0.6.12") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.6.12/solidity-js_0.6.12_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.6.12.js"
    );
    longVersion = "0.6.12";
  } else if (solcVersion == "0.6.8") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.6.8/solidity-js_0.6.8_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.6.8.js"
    );
    longVersion = "0.6.8";
  } else if (solcVersion == "0.6.2") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.6.2/solidity-js_0.6.2_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.6.2.js"
    );
    longVersion = "0.6.2";
  } else if (solcVersion == "0.5.17") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.17/solidity-js_0.5.17_Plato_v4.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.17.js"
    );
    longVersion = "0.5.17";
  } else if (solcVersion == "0.5.16") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.16/solidity-js_0.5.16_GreatVoyage_v4.1.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.16.js"
    );
    longVersion = "0.5.16";
  } else if (solcVersion == "0.6.0") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.6.0/solidity-js_0.6.0_GreatVoyage_v4.1.2.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.6.0.js"
    );
    longVersion = "0.6.0";
  } else if (solcVersion == "0.5.15") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.15/solidity-js_0.5.15_GreatVoyage_v4.1.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.15.js"
    );
    longVersion = "0.5.15";
  } else if (solcVersion == "0.5.14") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.14/solidity-js_0.5.14_GreatVoyage_v4.1.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.14.js"
    );
    longVersion = "0.5.14";
  } else if (solcVersion == "0.5.12") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.12/solidity-js_0.5.12_GreatVoyage_v4.0.1.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.12.js"
    );
    longVersion = "0.5.12";
  } else if (solcVersion == "0.5.8") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.8/soljson.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.8.js"
    );
    longVersion = "0.5.8";
  } else if (solcVersion == "0.5.4") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.5.4/tron-solidity-0.5.4_Odyssey_v3.6.0.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.5.4.js"
    );
    longVersion = "0.5.4";
  } else if (solcVersion == "0.4.25") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/0.4.25_Odyssey_v3.2.3/tron-solidity-0.4.25_Odyssey_v3.2.3.js';
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.4.25.js"
    );
    longVersion = "0.4.25";
  } else {
    throw new Error(`unkown solcVersion = ${solcVersion}`);
  }

  const needDownload = !await checkFileExists(compilerPath);
  if (needDownload) {
    await downloadFile(compilerRemotePath, compilerPath);    
  }
  
  return {
    compilerPath,
    isSolcJs: true, // if you are using a native compiler, set this to false
    version: solcVersion,
    // This is used as extra information in the build-info files,
    // but other than that is not important
    longVersion: longVersion,
  };
}
