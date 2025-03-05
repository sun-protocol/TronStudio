const path = require("path");
import { access, constants } from 'fs';
import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
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
  } catch (error) {
    console.error('download failed', error);
  }
}

export async function loadTronSolc(solcVersion: string) {
  let compilerPath = '';
  let compilerRemotePath = '';
  let longVersion = '';

  if (solcVersion === "0.8.23") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.23/soljson.js'
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.23.js"
    );
    longVersion = "0.8.23";
  } else if (solcVersion == "0.8.22") {
    compilerRemotePath = 'https://github.com/tronprotocol/solidity/releases/download/tv_0.8.22/soljson.js'
    compilerPath = path.join(
      __dirname,
      "soljson-tv_0.8.22.js"
    );
    longVersion = "0.8.22";
  }
  let needDownload = false;
  access(compilerPath, constants.F_OK, (err) => {
    if (err) {
      needDownload = true;
    }
  });
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
