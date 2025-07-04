/* eslint-disable @typescript-eslint/no-explicit-any */
import {Signer} from '@ethersproject/abstract-signer';
import {
  Web3Provider,
  TransactionResponse,
  TransactionRequest,
} from '@ethersproject/providers';
import {getAddress} from '@ethersproject/address';
import {Contract, PayableOverrides} from '@ethersproject/contracts';
import * as zk from 'zksync-ethers';
import {AddressZero} from '@ethersproject/constants';
import {BigNumber} from '@ethersproject/bignumber';
import {Wallet} from '@ethersproject/wallet';
import {keccak256 as solidityKeccak256} from '@ethersproject/solidity';
import {zeroPad, hexlify} from '@ethersproject/bytes';
import {Interface, FunctionFragment} from '@ethersproject/abi';
import {
  Deployment,
  DeployResult,
  DeploymentsExtension,
  DeployOptions,
  TxOptions,
  CallOptions,
  SimpleTx,
  Receipt,
  Address,
  DiamondOptions,
  Create2DeployOptions,
  FacetCut,
  DeploymentSubmission,
  ExtendedArtifact,
  FacetCutAction,
  Facet,
  ArtifactData,
  ABI,
} from '../types';
import {PartialExtension} from './internal/types';
import {UnknownSignerError} from './errors';
import {filterABI, mergeABIs, recode, countElements} from './utils';
import fs from 'fs-extra';

import oldDiamonBase from './old_diamondbase.json';
import {Artifact, EthereumProvider} from 'hardhat/types';
import {DeploymentsManager} from './DeploymentsManager';
import enquirer from 'enquirer';
import {
  parse as parseTransaction,
  Transaction,
} from '@ethersproject/transactions';
import {getDerivationPath} from './hdpath';
import {bnReplacer} from './internal/utils';
import {DeploymentFactory} from './DeploymentFactory';
import {TronWeb3Provider} from './tron/provider';
import {TronSigner} from './tron/signer';
import {CreateSmartContract} from './tron/types';
import {getDefaultArtifact} from './defaultArtifacts';
import TronWeb from 'tronweb';

let LedgerSigner: any; // TODO type
let ethersprojectHardwareWalletsModule: any | undefined;
let andrestEthersLedgerModule: any | undefined;
let TrezorSigner: any; // TODO type
let hardwareSigner: any; // TODO type

async function handleSpecificErrors<T>(p: Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await p;
  } catch (e) {
    if (
      typeof (e as any).message === 'string' &&
      (e as any).message.indexOf('already known') !== -1
    ) {
      console.log(
        `
Exact same transaction already in the pool, node reject duplicates.
You'll need to wait the tx resolve, or increase the gas price via --gasprice (this will use old tx type)
        `
      );
      throw new Error(
        'Exact same transaction already in the pool, node reject duplicates'
      );
      // console.log(
      //   `\nExact same transaction already in the pool, node reject duplicates, waiting for it instead...\n`
      // );
      // const signedTx = await ethersSigner.signTransaction(unsignedTx);
      // const decoded = parseTransaction(signedTx);
      // if (!decoded.hash) {
      //   throw new Error(
      //     'tx with same hash already in the pool, failed to decode to get the hash'
      //   );
      // }
      // const txHash = decoded.hash;
      // tx = Object.assign(decoded as TransactionResponse, {
      //   wait: (confirmations: number) =>
      //     provider.waitForTransaction(txHash, confirmations),
      //   confirmations: 0,
      // });
    } else {
      console.error((e as any).message, JSON.stringify(e, bnReplacer), e);
      throw e;
    }
  }
  return result;
}

function fixProvider(providerGiven: any): any {
  // alow it to be used by ethers without any change
  if (providerGiven.sendAsync === undefined) {
    providerGiven.sendAsync = (
      req: {
        id: number;
        jsonrpc: string;
        method: string;
        params: any[];
      },
      callback: (error: any, result: any) => void
    ) => {
      providerGiven
        .send(req.method, req.params)
        .then((result: any) =>
          callback(null, {result, id: req.id, jsonrpc: req.jsonrpc})
        )
        .catch((error: any) => callback(error, null));
    };
  }
  return providerGiven;
}

function findAll(toFind: string[], array: string[]): boolean {
  for (const f of toFind) {
    if (array.indexOf(f) === -1) {
      return false;
    }
  }
  return true;
}

function linkRawLibrary(
  bytecode: string,
  libraryName: string,
  libraryAddress: string
): string {
  const address = libraryAddress.replace('0x', '');
  let encodedLibraryName;
  if (libraryName.startsWith('$') && libraryName.endsWith('$')) {
    encodedLibraryName = libraryName.slice(1, libraryName.length - 1);
  } else {
    encodedLibraryName = solidityKeccak256(['string'], [libraryName]).slice(
      2,
      36
    );
  }
  const pattern = new RegExp(`_+\\$${encodedLibraryName}\\$_+`, 'g');
  if (!pattern.exec(bytecode)) {
    throw new Error(
      `Can't link '${libraryName}' (${encodedLibraryName}) in \n----\n ${bytecode}\n----\n`
    );
  }
  return bytecode.replace(pattern, address);
}

function linkRawLibraries(
  bytecode: string,
  libraries: {[libraryName: string]: Address}
): string {
  for (const libName of Object.keys(libraries)) {
    const libAddress = libraries[libName];
    bytecode = linkRawLibrary(bytecode, libName, libAddress);
  }
  return bytecode;
}

function linkLibraries(
  artifact: {
    bytecode: string;
    linkReferences?: {
      [libraryFileName: string]: {
        [libraryName: string]: Array<{length: number; start: number}>;
      };
    };
  },
  libraries?: {[libraryName: string]: Address}
) {
  let bytecode = artifact.bytecode;

  if (libraries) {
    if (artifact.linkReferences) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [fileName, fileReferences] of Object.entries(
        artifact.linkReferences
      )) {
        for (const [libName, fixups] of Object.entries(fileReferences)) {
          const addr = libraries[libName];
          if (addr === undefined) {
            continue;
          }

          for (const fixup of fixups) {
            bytecode =
              bytecode.substr(0, 2 + fixup.start * 2) +
              addr.substr(2) +
              bytecode.substr(2 + (fixup.start + fixup.length) * 2);
          }
        }
      }
    } else {
      bytecode = linkRawLibraries(bytecode, libraries);
    }
  }

  // TODO return libraries object with path name <filepath.sol>:<name> for names

  return bytecode;
}

export function addHelpers(
  deploymentManager: DeploymentsManager,
  partialExtension: PartialExtension,
  network: any, // TODO work out right config type
  getArtifact: (name: string) => Promise<Artifact>,
  saveDeployment: (
    name: string,
    deployment: DeploymentSubmission,
    artifactName?: string
  ) => Promise<void>,
  willSaveToDisk: () => boolean,
  onPendingTx: (
    txResponse: TransactionResponse,
    name?: string,
    data?: any
  ) => Promise<TransactionResponse>,
  getGasPrice: () => Promise<{
    gasPrice: BigNumber | undefined;
    maxFeePerGas: BigNumber | undefined;
    maxPriorityFeePerGas: BigNumber | undefined;
  }>,
  log: (...args: any[]) => void,
  print: (msg: string) => void
): {
  extension: DeploymentsExtension;
  utils: {
    dealWithPendingTransactions: (
      pendingTxs: {
        [txHash: string]: {
          name: string;
          deployment?: any;
          rawTx: string;
          decoded: {
            from: string;
            gasPrice?: string;
            maxFeePerGas?: string;
            maxPriorityFeePerGas?: string;
            gasLimit: string;
            to: string;
            value: string;
            nonce: number;
            data: string;
            r: string;
            s: string;
            v: number;
            // creates: tx.creates, // TODO test
            chainId: number;
          };
        };
      },
      pendingTxPath: string,
      globalGasPrice: string | undefined
    ) => Promise<void>;
  };
} {
  let provider: Web3Provider | zk.Web3Provider | TronWeb3Provider;
  const availableAccounts: {[name: string]: boolean} = {};

  async function init(): Promise<
    Web3Provider | zk.Web3Provider | TronWeb3Provider
  > {
    if (!provider) {
      await deploymentManager.setupAccounts();
      if (network.zksync) {
        provider = new zk.Web3Provider(fixProvider(network.provider));
      } else if (network.tron) {
        provider = new TronWeb3Provider(
          fixProvider(network.provider),
          network.config
        );
      } else {
        provider = new Web3Provider(fixProvider(network.provider));
      }
      try {
        const accounts = await provider.send('eth_accounts', []);
        for (const account of accounts) {
          availableAccounts[account.toLowerCase()] = true;
        }

        for (const address of deploymentManager.impersonatedAccounts) {
          availableAccounts[address.toLowerCase()] = true;
        }
      } catch (e) {}
    }
    return provider;
  }

  function cleanupOverrides<T extends PayableOverrides>(
    txRequestOrOverrides: T
  ): T {
    if (txRequestOrOverrides.maxFeePerGas === undefined) {
      delete txRequestOrOverrides.maxFeePerGas;
    }

    if (txRequestOrOverrides.maxPriorityFeePerGas === undefined) {
      delete txRequestOrOverrides.maxPriorityFeePerGas;
    }

    if (txRequestOrOverrides.gasPrice === undefined) {
      delete txRequestOrOverrides.gasPrice;
    }

    if (txRequestOrOverrides.value === undefined) {
      delete txRequestOrOverrides.value;
    }
    return txRequestOrOverrides;
  }

  async function setupGasPrice(
    txRequestOrOverrides: TransactionRequest | PayableOverrides
  ) {
    const gasPriceSetup = await getGasPrice();
    if (!txRequestOrOverrides.gasPrice) {
      txRequestOrOverrides.gasPrice = gasPriceSetup.gasPrice;
    }
    if (!txRequestOrOverrides.maxFeePerGas) {
      txRequestOrOverrides.maxFeePerGas = gasPriceSetup.maxFeePerGas;
    }
    if (!txRequestOrOverrides.maxPriorityFeePerGas) {
      txRequestOrOverrides.maxPriorityFeePerGas =
        gasPriceSetup.maxPriorityFeePerGas;
    }
    cleanupOverrides(txRequestOrOverrides);
  }

  async function setupNonce(
    from: string,
    txRequestOrOverrides: TransactionRequest | PayableOverrides
  ) {
    if (
      txRequestOrOverrides.nonce === 'pending' ||
      txRequestOrOverrides.nonce === 'latest'
    ) {
      txRequestOrOverrides.nonce = await provider.getTransactionCount(
        from,
        txRequestOrOverrides.nonce
      );
    } else if (!txRequestOrOverrides.nonce) {
      txRequestOrOverrides.nonce = await provider.getTransactionCount(
        from,
        'latest'
      );
    }
  }

  async function overrideGasLimit(
    txRequestOrOverrides: TransactionRequest | PayableOverrides,
    options: {
      estimatedGasLimit?: number | BigNumber | string;
      estimateGasExtra?: number | BigNumber | string;
    },
    estimate: (
      txRequestOrOverrides: TransactionRequest | PayableOverrides
    ) => Promise<BigNumber>
  ) {
    const estimatedGasLimit = options.estimatedGasLimit
      ? BigNumber.from(options.estimatedGasLimit).toNumber()
      : undefined;
    const estimateGasExtra = options.estimateGasExtra
      ? BigNumber.from(options.estimateGasExtra).toNumber()
      : undefined;
    if (!txRequestOrOverrides.gasLimit) {
      txRequestOrOverrides.gasLimit = estimatedGasLimit;
      txRequestOrOverrides.gasLimit = (
        await estimate(txRequestOrOverrides)
      ).toNumber();
      if (estimateGasExtra) {
        txRequestOrOverrides.gasLimit =
          txRequestOrOverrides.gasLimit + estimateGasExtra;
        if (estimatedGasLimit) {
          txRequestOrOverrides.gasLimit = Math.min(
            txRequestOrOverrides.gasLimit,
            estimatedGasLimit
          );
        }
      }
    }
  }

  async function ensureCreate2DeployerReady(options: {
    from: string;
    log?: boolean;
    gasPrice?: string | BigNumber;
    maxFeePerGas?: string | BigNumber;
    maxPriorityFeePerGas?: string | BigNumber;
  }): Promise<string> {
    const {
      address: from,
      ethersSigner,
      hardwareWallet,
      unknown,
    } = await getFrom(options.from);
    const create2DeployerAddress =
      await deploymentManager.getDeterministicDeploymentFactoryAddress();
    const code = await provider.getCode(create2DeployerAddress);
    if (code === '0x') {
      const senderAddress =
        await deploymentManager.getDeterministicDeploymentFactoryDeployer();

      // TODO: calculate required funds
      const txRequest = {
        to: senderAddress,
        value: (
          await deploymentManager.getDeterministicDeploymentFactoryFunding(
            network.tron
          )
        ).toHexString(),
        gasPrice: options.gasPrice,
        maxFeePerGas: options.maxFeePerGas,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas,
      };
      await setupGasPrice(txRequest);
      await setupNonce(from, txRequest);

      if (unknown) {
        throw new UnknownSignerError({
          from,
          ...txRequest,
        });
      }

      if (options.log || hardwareWallet) {
        print(
          `sending eth to create2 contract deployer address (${senderAddress})`
        );
        if (hardwareWallet) {
          print(` (please confirm on your ${hardwareWallet})`);
        }
      }

      let ethTx = (await handleSpecificErrors(
        ethersSigner.sendTransaction(txRequest)
      )) as TransactionResponse;
      if (options.log || hardwareWallet) {
        log(` (tx: ${ethTx.hash})...`);
      }
      ethTx = await onPendingTx(ethTx);
      await ethTx.wait();

      if (options.log || hardwareWallet) {
        print(
          `deploying create2 deployer contract (at ${create2DeployerAddress}) using deterministic deployment (https://github.com/Arachnid/deterministic-deployment-proxy)`
        );
        if (hardwareWallet) {
          print(` (please confirm on your ${hardwareWallet})`);
        }
      }
      const deployTx = await provider.sendTransaction(
        await deploymentManager.getDeterministicDeploymentFactoryDeploymentTx()
      );
      if (options.log || hardwareWallet) {
        log(` (tx: ${deployTx.hash})...`);
      }
      await deployTx.wait();
    }
    return create2DeployerAddress;
  }

  async function getArtifactFromOptions(
    name: string,
    options: DeployOptions
  ): Promise<{
    artifact: Artifact;
    artifactName?: string;
  }> {
    let artifact: Artifact;
    let artifactName: string | undefined;
    if (options.contract) {
      if (typeof options.contract === 'string') {
        artifactName = options.contract;
        artifact = await getArtifact(artifactName);
      } else {
        artifact = options.contract as Artifact; // TODO better handling
      }
    } else {
      artifactName = name;
      artifact = await getArtifact(artifactName);
    }
    return {artifact, artifactName};
  }

  async function getLinkedArtifact(
    name: string,
    options: DeployOptions
  ): Promise<{artifact: Artifact; artifactName: string | undefined}> {
    // TODO get linked artifact
    const {artifact, artifactName} = await getArtifactFromOptions(
      name,
      options
    );
    const byteCode = linkLibraries(artifact, options.libraries);
    return {artifact: {...artifact, bytecode: byteCode}, artifactName};
  }

  async function _deploy(
    name: string,
    options: DeployOptions
  ): Promise<DeployResult> {
    const args: any[] = options.args ? [...options.args] : [];
    await init();
    const {
      address: from,
      ethersSigner,
      hardwareWallet,
      unknown,
    } = await getFrom(options.from);

    const {artifact: linkedArtifact, artifactName} = await getLinkedArtifact(
      name,
      options
    );

    const overrides: PayableOverrides = {
      gasLimit: options.gasLimit,
      gasPrice: options.gasPrice,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas,
      value: options.value,
      nonce: options.nonce,
    };

    const factory = new DeploymentFactory(
      getArtifact,
      linkedArtifact,
      args,
      network,
      ethersSigner,
      overrides
    );

    const unsignedTx = await factory.getDeployTransaction();

    let create2Address;
    if (options.deterministicDeployment) {
      // feature not ready for Tron yet
      if (network.tron) {
        throw new Error('deterministic deployment not supported on Tron');
      }
      if (typeof unsignedTx.data === 'string') {
        const create2DeployerAddress = await ensureCreate2DeployerReady(
          options
        );
        const create2Salt =
          typeof options.deterministicDeployment === 'string'
            ? hexlify(zeroPad(options.deterministicDeployment, 32))
            : '0x0000000000000000000000000000000000000000000000000000000000000000';
        create2Address = await factory.getCreate2Address(
          create2DeployerAddress,
          create2Salt
        );
        unsignedTx.to = create2DeployerAddress;

        unsignedTx.data = create2Salt + unsignedTx.data.slice(2);
      } else {
        throw new Error('unsigned tx data as bytes not supported');
      }
    }

    if (network.tron) {
      const feeLimit = await (ethersSigner as TronSigner).getFeeLimit(
        unsignedTx,
        overrides
      );
      (unsignedTx as CreateSmartContract).feeLimit = feeLimit;
    } else {
      await overrideGasLimit(unsignedTx, options, (newOverrides) =>
        ethersSigner.estimateGas(newOverrides)
      );
      await setupGasPrice(unsignedTx);
      await setupNonce(from, unsignedTx);
      // Temporary workaround for https://github.com/ethers-io/ethers.js/issues/2078
      // TODO: Remove me when LedgerSigner adds proper support for 1559 txns
      if (hardwareWallet === 'ledger') {
        unsignedTx.type = 1;
      } else if (hardwareWallet === 'trezor') {
        unsignedTx.type = 1;
      }
    }

    if (unknown) {
      throw new UnknownSignerError({
        from,
        ...JSON.parse(JSON.stringify(unsignedTx, bnReplacer)),
      });
    }

    if (options.log || hardwareWallet) {
      print(`deploying "${name}"`);
      if (hardwareWallet) {
        print(` (please confirm on your ${hardwareWallet})`);
      }
    }
    let tx = (await handleSpecificErrors(
      ethersSigner.sendTransaction(unsignedTx)
    )) as TransactionResponse;

    if (options.log || hardwareWallet) {
      print(` (tx: ${tx.hash})...`);
    }

    if (options.autoMine) {
      try {
        await provider.send('evm_mine', []);
      } catch (e) {}
    }

    let preDeployment = {
      ...linkedArtifact,
      transactionHash: tx.hash,
      args,
      linkedData: options.linkedData
    };
    if (artifactName && willSaveToDisk()) {
      const extendedArtifact = await partialExtension.getExtendedArtifact(
        artifactName
      );
      preDeployment = {
        ...extendedArtifact,
        ...preDeployment,
      };
    }
    type TronTxInfo = {
      receipt?: {
        net_usage?: number;
        energy_usage_total?: number;
      };
      fee?: number;
    };

    tx = await onPendingTx(tx, name, preDeployment);
    const receiptPre = await tx.wait(options.waitConfirmations);
    const addressPre =
      options.deterministicDeployment && create2Address
        ? create2Address
        : receiptPre.contractAddress;
    let receipt;
    let address;
    let bandwith;
    if (network.tron && ethersSigner instanceof TronSigner){

      const tronwebCurr = ethersSigner.getTronWeb();
      const url = tronwebCurr.fullNode.host.replace(/\/jsonrpc$/, "");
      const tronweb = new TronWeb(
        url,
        url,
        false,
        false
      );
      receipt = receiptPre;
      receipt.from = tronweb.address.fromHex(receiptPre.from);
      receipt.to = tronweb.address.fromHex(receiptPre.to);
      receipt.contractAddress = tronweb.address.fromHex(receiptPre.contractAddress);
      address = tronweb.address.fromHex(addressPre);
      const resp = await tronweb.trx.getUnconfirmedTransactionInfo(tx.hash) as TronTxInfo;
      if (resp?.receipt?.net_usage != null) {
        bandwith = resp?.receipt?.net_usage;
      } else if (resp?.fee != null) {
        bandwith = resp.fee;
      }
    }else{
      receipt = receiptPre;
      address = addressPre;
    }
   
    const argNumbers = countElements(preDeployment.args);
    const deployment = {
      ...preDeployment,
      address,
      receipt,
      transactionHash: receipt.transactionHash,
      libraries: options.libraries,
      bandwith: bandwith,
    };
    await saveDeployment(name, deployment);
    if (options.log || hardwareWallet) {
      print(
        `: deployed at ${deployment.address} with ${receipt?.gasUsed} gas\n`
      );
    }
    return {
      ...deployment,
      address,
      newlyDeployed: true,
    };
  }

  async function deterministic(
    name: string,
    options: Create2DeployOptions
  ): Promise<{
    address: Address;
    implementationAddress?: Address;
    deploy: () => Promise<DeployResult>;
  }> {
    options = {...options}; // ensure no change
    await init();

    const deployFunction = () =>
      deploy(name, {
        ...options,
        deterministicDeployment: options.salt || true,
      });
    if (options.proxy) {
      /* eslint-disable prefer-const */
      let {
        viaAdminContract,
        proxyAdminDeployed,
        proxyAdminName,
        proxyAdminContract,
        owner,
        proxyAdmin,
        currentProxyAdminOwner,
        artifact,
        implementationArgs,
        implementationName,
        implementationOptions,
        proxyName,
        proxyContract,
        proxyArgsTemplate,
        mergedABI,
        updateMethod,
        updateArgs,
      } = await _getProxyInfo(name, options);
      /* eslint-enable prefer-const */

      const {address: implementationAddress} = await deterministic(
        implementationName,
        {...implementationOptions, salt: options.salt}
      );

      const implementationContract = new Contract(
        implementationAddress,
        artifact.abi
      );

      let data = '0x';
      if (updateMethod) {
        updateArgs = updateArgs || [];
        if (!implementationContract[updateMethod]) {
          throw new Error(
            `contract need to implement function ${updateMethod}`
          );
        }
        const txData = await implementationContract.populateTransaction[
          updateMethod
        ](...updateArgs);
        data = txData.data || '0x';
      }

      if (viaAdminContract) {
        if (!proxyAdminName) {
          throw new Error(
            `no proxy admin name even though viaAdminContract is not undefined`
          );
        }

        if (!proxyAdminDeployed) {
          const {address: proxyAdminAddress} = await deterministic(
            proxyAdminName,
            {
              from: options.from,
              autoMine: options.autoMine,
              estimateGasExtra: options.estimateGasExtra,
              estimatedGasLimit: options.estimatedGasLimit,
              gasPrice: options.gasPrice,
              maxFeePerGas: options.maxFeePerGas,
              maxPriorityFeePerGas: options.maxPriorityFeePerGas,
              log: options.log,
              contract: proxyAdminContract,
              salt: options.salt,
              skipIfAlreadyDeployed: true,
              args: [owner],
              waitConfirmations: options.waitConfirmations,
            }
          );
          proxyAdmin = proxyAdminAddress;
        } else {
          proxyAdmin = proxyAdminDeployed.address;
        }
      }

      const proxyOptions = {...options}; // ensure no change
      delete proxyOptions.proxy;
      delete proxyOptions.libraries;
      proxyOptions.contract = proxyContract;
      proxyOptions.args = replaceTemplateArgs(proxyArgsTemplate, {
        implementationAddress,
        proxyAdmin,
        data,
      });
      const {address: proxyAddress} = await deterministic(proxyName, {
        ...proxyOptions,
        salt: options.salt,
      });

      return {
        address: proxyAddress,
        implementationAddress,
        deploy: deployFunction,
      };
    } else {
      const args: any[] = options.args ? [...options.args] : [];
      const {
        ethersSigner,
        unknown,
        address: from,
      } = await getFrom(options.from);

      const {artifact: linkedArtifact, artifactName} = await getLinkedArtifact(
        name,
        options
      );
      const factory = new DeploymentFactory(
        getArtifact,
        linkedArtifact,
        args,
        network,
        ethersSigner
      );

      if (unknown) {
        throw new UnknownSignerError({
          from,
          ...JSON.parse(
            JSON.stringify(await factory.getDeployTransaction(), bnReplacer)
          ),
        });
      }

      return {
        address: await factory.getCreate2Address(
          await deploymentManager.getDeterministicDeploymentFactoryAddress(),
          options.salt
            ? hexlify(zeroPad(options.salt, 32))
            : '0x0000000000000000000000000000000000000000000000000000000000000000'
        ),
        deploy: () =>
          deploy(name, {
            ...options,
            deterministicDeployment: options.salt || true,
          }),
      };
    }
  }

  function getDeployment(name: string): Promise<Deployment> {
    return partialExtension.get(name);
  }

  function getDeploymentOrNUll(name: string): Promise<Deployment | null> {
    return partialExtension.getOrNull(name);
  }

  async function fetchIfDifferent(
    name: string,
    options: DeployOptions
  ): Promise<{differences: boolean; address?: string}> {
    options = {...options}; // ensure no change
    const args = options.args ? [...options.args] : [];
    await init();

    const {ethersSigner} = await getFrom(options.from);
    const {artifact: linkedArtifact} = await getLinkedArtifact(name, options);
    const factory = new DeploymentFactory(
      getArtifact,
      linkedArtifact,
      args,
      network,
      ethersSigner
    );

    if (options.deterministicDeployment) {
      const create2Salt =
        typeof options.deterministicDeployment === 'string'
          ? hexlify(zeroPad(options.deterministicDeployment, 32))
          : '0x0000000000000000000000000000000000000000000000000000000000000000';
      const create2DeployerAddress =
        await deploymentManager.getDeterministicDeploymentFactoryAddress();
      const create2Address = await factory.getCreate2Address(
        create2DeployerAddress,
        create2Salt
      );
      const code = await provider.getCode(create2Address);
      if (code === '0x') {
        return {differences: true, address: undefined};
      } else {
        return {differences: false, address: create2Address};
      }
    }
    const deployment = await partialExtension.getOrNull(name);
    if (deployment) {
      if (options.skipIfAlreadyDeployed) {
        return {differences: false, address: undefined}; // TODO check receipt, see below
      }
      // TODO transactionReceipt + check for status
      let transactionDetailsAvailable = false;
      let transaction;
      if (deployment.receipt) {
        transactionDetailsAvailable = !!deployment.receipt.transactionHash;
        if (transactionDetailsAvailable) {
          transaction = await provider.getTransaction(
            deployment.receipt.transactionHash
          );
        }
      } else if (deployment.transactionHash) {
        transactionDetailsAvailable = true;
        transaction = await provider.getTransaction(deployment.transactionHash);
      }

      if (transaction) {
        const differences = await factory.compareDeploymentTransaction(
          transaction,
	  deployment
        );
        return {differences, address: deployment.address};
      } else {
        if (transactionDetailsAvailable) {
          throw new Error(
            `cannot get the transaction for ${name}'s previous deployment, please check your node synced status.`
          );
        } else {
          console.error(
            `no transaction details found for ${name}'s previous deployment, if the deployment is t be discarded, please delete the file`
          );
          return {differences: false, address: deployment.address};
        }
      }
    }
    return {differences: true, address: undefined};
  }

  async function _deployOne(
    name: string,
    options: DeployOptions,
    failsOnExistingDeterminisitc?: boolean
  ): Promise<DeployResult> {
    const argsArray = options.args ? [...options.args] : [];
    options = {...options, args: argsArray};

    let result: DeployResult;
    const diffResult = await fetchIfDifferent(name, options);
    if (diffResult.differences) {
      result = await _deploy(name, options);
    } else {
      if (failsOnExistingDeterminisitc && options.deterministicDeployment) {
        throw new Error(
          `already deployed on same deterministic address: ${diffResult.address}`
        );
      }
      const deployment = await getDeploymentOrNUll(name);
      if (deployment) {
        if (
          options.deterministicDeployment &&
          diffResult.address &&
          diffResult.address.toLowerCase() !== deployment.address.toLowerCase()
        ) {
          const {artifact: linkedArtifact, artifactName} =
            await getLinkedArtifact(name, options);

          // receipt missing
          const newDeployment = {
            ...linkedArtifact,
            address: diffResult.address,
            linkedData: options.linkedData,
            libraries: options.libraries,
            args: argsArray,
          };
          await saveDeployment(name, newDeployment, artifactName);
          result = {
            ...newDeployment,
            newlyDeployed: false,
          };
        } else {
          result = deployment as DeployResult;
          result.newlyDeployed = false;
        }
      } else {
        if (!diffResult.address) {
          throw new Error(
            'no differences found but no address, this should be impossible'
          );
        }

        const {artifact: linkedArtifact, artifactName} =
          await getLinkedArtifact(name, options);

        // receipt missing
        const newDeployment = {
          ...linkedArtifact,
          address: diffResult.address,
          linkedData: options.linkedData,
          libraries: options.libraries,
          args: argsArray,
        };
        await saveDeployment(name, newDeployment, artifactName);
        result = {
          ...newDeployment,
          newlyDeployed: false,
        };
      }
      if (options.log) {
        log(`reusing "${name}" at ${result.address}`);
      }
    }

    return result;
  }

  function _checkUpgradeIndex(
    oldDeployment: Deployment | null,
    upgradeIndex?: number
  ): DeployResult | undefined {
    if (typeof upgradeIndex === 'undefined') {
      return;
    }
    if (upgradeIndex === 0) {
      if (oldDeployment) {
        return {...oldDeployment, newlyDeployed: false};
      }
    } else if (upgradeIndex === 1) {
      if (!oldDeployment) {
        throw new Error(
          'upgradeIndex === 1 : expects Deployments to already exists'
        );
      }
      if (
        (oldDeployment.history && oldDeployment.history.length > 0) ||
        (oldDeployment.numDeployments && oldDeployment.numDeployments > 1)
      ) {
        return {...oldDeployment, newlyDeployed: false};
      }
    } else {
      if (!oldDeployment) {
        throw new Error(
          `upgradeIndex === ${upgradeIndex} : expects Deployments to already exists`
        );
      }

      if (!oldDeployment.history) {
        if (oldDeployment.numDeployments && oldDeployment.numDeployments > 1) {
          if (oldDeployment.numDeployments > upgradeIndex) {
            return {...oldDeployment, newlyDeployed: false};
          } else if (oldDeployment.numDeployments < upgradeIndex) {
            throw new Error(
              `upgradeIndex === ${upgradeIndex} : expects Deployments numDeployments to be at least ${upgradeIndex}`
            );
          }
        } else {
          throw new Error(
            `upgradeIndex > 1 : expects Deployments history to exists, or numDeployments to be greater than 1`
          );
        }
      } else if (oldDeployment.history.length > upgradeIndex - 1) {
        return {...oldDeployment, newlyDeployed: false};
      } else if (oldDeployment.history.length < upgradeIndex - 1) {
        throw new Error(
          `upgradeIndex === ${upgradeIndex} : expects Deployments history length to be at least ${
            upgradeIndex - 1
          }`
        );
      }
    }
  }

  async function _getProxyInfo(
    name: string,
    options: DeployOptions
  ): Promise<{
    viaAdminContract:
      | string
      | {name: string; artifact?: string | ArtifactData}
      | undefined;
    proxyAdminName: string | undefined;
    proxyAdminDeployed: Deployment | undefined;
    proxyAdmin: string;
    proxyAdminContract: ExtendedArtifact | undefined;
    owner: string;
    currentProxyAdminOwner: string | undefined;
    artifact: ExtendedArtifact;
    implementationArgs: any[];
    implementationName: string;
    implementationOptions: DeployOptions;
    mergedABI: ABI;
    proxyName: string;
    proxyContract: ExtendedArtifact;
    proxyArgsTemplate: any[];
    oldDeployment: Deployment | null;
    updateMethod: string | undefined;
    updateArgs: any[];
    upgradeIndex: number | undefined;
    checkProxyAdmin: boolean;
    upgradeMethod: string | undefined;
    upgradeArgsTemplate: any[];
  }> {
    const {isTronNetworkWithTronSolc} = deploymentManager;
    const oldDeployment = await getDeploymentOrNUll(name);
    let contractName = options.contract;
    let implementationName = name + '_Implementation';
    let updateMethod: string | undefined;
    let updateArgs: any[] | undefined;
    let upgradeIndex;
    const eip173Proxy: ExtendedArtifact = getDefaultArtifact(
      'EIP173Proxy',
      isTronNetworkWithTronSolc
    );
    let proxyContract: ExtendedArtifact = eip173Proxy;
    let checkABIConflict = true;
    let checkProxyAdmin = true;
    let viaAdminContract:
      | string
      | {name: string; artifact?: string | ArtifactData}
      | undefined;
    let proxyArgsTemplate = ['{implementation}', '{admin}', '{data}'];
    let upgradeMethod: string | undefined;
    let upgradeArgsTemplate: string[] = [];
    if (typeof options.proxy === 'object') {
      if (options.proxy.proxyArgs) {
        proxyArgsTemplate = options.proxy.proxyArgs;
      }
      upgradeIndex = options.proxy.upgradeIndex;
      if (options.proxy.implementationName) {
        implementationName = options.proxy.implementationName;
        if (implementationName === name) {
          throw new Error(
            `"implementationName" cannot be equal to the deployment's name (${name}) as this is used for the proxy itself.`
          );
        }
        if (!contractName) {
          contractName = implementationName;
        }
      }
      if ('methodName' in options.proxy) {
        updateMethod = options.proxy.methodName;
        if ('execute' in options.proxy) {
          throw new Error(
            `cannot have both "methodName" and "execute" options for proxy`
          );
        }
      } else if ('execute' in options.proxy && options.proxy.execute) {
        if ('methodName' in options.proxy.execute) {
          updateMethod = options.proxy.execute.methodName;
          updateArgs = options.proxy.execute.args;
          if (
            'init' in options.proxy.execute ||
            'onUpgrade' in options.proxy.execute
          ) {
            throw new Error(
              `cannot have both "methodName" and ("onUpgrade" or "init") options for proxy.execute`
            );
          }
        } else if (
          ('init' in options.proxy.execute && options.proxy.execute.init) ||
          ('onUpgrade' in options.proxy.execute &&
            options.proxy.execute.onUpgrade)
        ) {
          if (oldDeployment) {
            updateMethod = options.proxy.execute.onUpgrade?.methodName;
            updateArgs = options.proxy.execute.onUpgrade?.args;
          } else {
            updateMethod = options.proxy.execute.init.methodName;
            updateArgs = options.proxy.execute.init.args;
          }
        }
      }

      checkABIConflict = options.proxy.checkABIConflict ?? checkABIConflict;
      checkProxyAdmin = options.proxy.checkProxyAdmin ?? checkProxyAdmin;

      if (options.proxy.proxyContract) {
        if (typeof options.proxy.proxyContract === 'string') {
          try {
            proxyContract = await partialExtension.getExtendedArtifact(
              options.proxy.proxyContract
            );
          } catch (e) {}
          if (!proxyContract || proxyContract === eip173Proxy) {
            proxyContract = getDefaultArtifact(
              options.proxy.proxyContract,
              isTronNetworkWithTronSolc
            );
            switch (options.proxy.proxyContract) {
              case 'EIP173ProxyWithReceive':
              case 'EIP173Proxy':
                break; // No specific logic, but don't throw an error
              case 'OpenZeppelinTransparentProxy':
              case 'OptimizedTransparentProxy':
                checkABIConflict = false;
                viaAdminContract = 'DefaultProxyAdmin';
                break;
              case 'UUPS':
                checkABIConflict = false;
                checkProxyAdmin = false;
                proxyArgsTemplate = ['{implementation}', '{data}'];
                break;
              default:
                throw new Error(
                  `no contract found for ${options.proxy.proxyContract}`
                );
            }
          }
        }
      }
      if (options.proxy.viaAdminContract) {
        viaAdminContract = options.proxy.viaAdminContract;
      }

      if (options.proxy.upgradeFunction) {
        upgradeMethod = options.proxy.upgradeFunction.methodName;
        upgradeArgsTemplate = options.proxy.upgradeFunction.upgradeArgs;
      }
    } else if (typeof options.proxy === 'string') {
      updateMethod = options.proxy;
    }

    const proxyName = name + '_Proxy';
    const {address: owner} = await getProxyOwner(options);
    const implementationArgs = options.args ? [...options.args] : [];

    // --- Implementation Deployment ---
    const implementationOptions = {
      contract: contractName || name,
      from: options.from,
      autoMine: options.autoMine,
      estimateGasExtra: options.estimateGasExtra,
      estimatedGasLimit: options.estimatedGasLimit,
      gasPrice: options.gasPrice,
      maxFeePerGas: options.maxFeePerGas,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas,
      log: options.log,
      deterministicDeployment: options.deterministicDeployment,
      libraries: options.libraries,
      linkedData: options.linkedData,
      args: implementationArgs,
      skipIfAlreadyDeployed: options.skipIfAlreadyDeployed,
      waitConfirmations: options.waitConfirmations,
    };

    const {artifact} = await getArtifactFromOptions(
      name,
      implementationOptions
    );

    const proxyContractConstructor = proxyContract.abi.find(
      (v) => v.type === 'constructor'
    );
    // ensure no clash
    const mergedABI = mergeABIs([proxyContract.abi, artifact.abi], {
      check: checkABIConflict,
      skipSupportsInterface: true, // TODO options for custom proxy ?
    }).filter((v) => v.type !== 'constructor');
    mergedABI.push(proxyContractConstructor); // use proxy constructor abi

    const constructor = artifact.abi.find(
      (fragment: {type: string; inputs: any[]}) =>
        fragment.type === 'constructor'
    );

    if (
      (!constructor && implementationArgs.length > 0) ||
      (constructor && constructor.inputs.length !== implementationArgs.length)
    ) {
      throw new Error(
        `The number of arguments passed to not match the number of argument in the implementation constructor.
Please specify the correct number of arguments as part of the deploy options: "args"`
      );
    }

    if (updateMethod) {
      const updateMethodFound: {
        type: string;
        inputs: any[];
        name: string;
      } = artifact.abi.find(
        (fragment: {type: string; inputs: any[]; name: string}) =>
          fragment.type === 'function' && fragment.name === updateMethod
      );
      if (!updateMethodFound) {
        throw new Error(`contract need to implement function ${updateMethod}`);
      }

      if (!updateArgs) {
        if (implementationArgs.length === updateMethodFound.inputs.length) {
          updateArgs = implementationArgs;
        } else {
          throw new Error(
            `
If only the methodName (and no args) is specified for proxy deployment, the arguments used for the implementation contract will be reused for the update method.
This allow your contract to both be deployed directly and deployed via proxy.

Currently your contract implementation's constructor do not have the same number of arguments as the update method.
You can either changes the contract or use the "execute" options and specify different arguments for the update method.
Note that in this case, the contract deployment will not behave the same if deployed without proxy.
    `
          );
        }
      }
    }

    // this avoid typescript error, but should not be necessary at runtime
    if (!updateArgs) {
      updateArgs = implementationArgs;
    }

    let proxyAdminName: string | undefined;
    const proxyAdmin = owner;
    let currentProxyAdminOwner: string | undefined;
    let proxyAdminDeployed: Deployment | undefined;
    let proxyAdminContract: ExtendedArtifact | undefined;
    if (viaAdminContract) {
      let proxyAdminArtifactNameOrContract: string | ArtifactData | undefined;
      if (typeof viaAdminContract === 'string') {
        proxyAdminName = viaAdminContract;
        proxyAdminArtifactNameOrContract = viaAdminContract;
      } else {
        proxyAdminName = viaAdminContract.name;
        if (!viaAdminContract.artifact) {
          proxyAdminDeployed = await partialExtension.get(proxyAdminName);
        }
        proxyAdminArtifactNameOrContract = viaAdminContract.artifact;
      }

      if (typeof proxyAdminArtifactNameOrContract === 'string') {
        try {
          proxyAdminContract = await partialExtension.getExtendedArtifact(
            proxyAdminArtifactNameOrContract
          );
        } catch (e) {}

        if (!proxyAdminContract) {
          if (viaAdminContract === 'DefaultProxyAdmin') {
            proxyAdminContract = getDefaultArtifact(
              'DefaultProxyAdmin',
              isTronNetworkWithTronSolc
            );
          } else {
            throw new Error(
              `no contract found for ${proxyAdminArtifactNameOrContract}`
            );
          }
        }
      } else {
        proxyAdminContract = proxyAdminArtifactNameOrContract;
      }
    }

    // Set upgrade function if not defined by the user, based on other options
    if (!upgradeMethod) {
      if (viaAdminContract) {
        if (updateMethod) {
          upgradeMethod = 'upgradeAndCall';
          upgradeArgsTemplate = ['{proxy}', '{implementation}', '{data}'];
        } else {
          upgradeMethod = 'upgrade';
          upgradeArgsTemplate = ['{proxy}', '{implementation}'];
        }
      } else if (updateMethod) {
        upgradeMethod = 'upgradeToAndCall';
        upgradeArgsTemplate = ['{implementation}', '{data}'];
      } else {
        upgradeMethod = 'upgradeTo';
        upgradeArgsTemplate = ['{implementation}'];
      }
    }

    return {
      proxyName,
      proxyContract,
      proxyArgsTemplate,
      mergedABI,
      viaAdminContract,
      proxyAdminDeployed,
      proxyAdminName,
      proxyAdminContract,
      owner,
      proxyAdmin,
      currentProxyAdminOwner,
      artifact,
      implementationArgs,
      implementationName,
      implementationOptions,
      oldDeployment,
      updateMethod,
      updateArgs,
      upgradeIndex,
      checkProxyAdmin,
      upgradeMethod,
      upgradeArgsTemplate,
    };
  }

  async function _deployViaProxy(
    name: string,
    options: DeployOptions
  ): Promise<DeployResult> {
    /* eslint-disable prefer-const */
    let {
      oldDeployment,
      updateMethod,
      updateArgs,
      upgradeIndex,
      viaAdminContract,
      proxyAdminDeployed,
      proxyAdminName,
      proxyAdminContract,
      owner,
      proxyAdmin,
      currentProxyAdminOwner,
      implementationName,
      implementationOptions,
      proxyName,
      proxyContract,
      proxyArgsTemplate,
      mergedABI,
      checkProxyAdmin,
      upgradeMethod,
      upgradeArgsTemplate,
    } = await _getProxyInfo(name, options);
    /* eslint-enable prefer-const */

    const deployResult = _checkUpgradeIndex(oldDeployment, upgradeIndex);
    if (deployResult) {
      return deployResult;
    }

    if (viaAdminContract) {
      if (!proxyAdminName) {
        throw new Error(
          `no proxy admin name even though viaAdminContract is not undefined`
        );
      }
      if (!proxyAdminDeployed) {
        proxyAdminDeployed = await _deployOne(proxyAdminName, {
          from: options.from,
          autoMine: options.autoMine,
          estimateGasExtra: options.estimateGasExtra,
          estimatedGasLimit: options.estimatedGasLimit,
          gasPrice: options.gasPrice,
          maxFeePerGas: options.maxFeePerGas,
          maxPriorityFeePerGas: options.maxPriorityFeePerGas,
          log: options.log,
          contract: proxyAdminContract,
          deterministicDeployment: options.deterministicDeployment,
          skipIfAlreadyDeployed: true,
          args: [owner],
          waitConfirmations: options.waitConfirmations,
        });
      }

      proxyAdmin = proxyAdminDeployed.address;
      currentProxyAdminOwner = (await read(proxyAdminName, 'owner')) as string;

      if (currentProxyAdminOwner.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(
          `To change owner/admin, you need to call transferOwnership on ${proxyAdminName}`
        );
      }
      if (currentProxyAdminOwner === AddressZero) {
        throw new Error(
          `The Proxy Admin (${proxyAdminName}) belongs to no-one. The Proxy cannot be upgraded anymore`
        );
      }
    }

    const implementation = await _deployOne(
      implementationName,
      implementationOptions
    );

    if (!oldDeployment || implementation.newlyDeployed) {
      // console.log(`implementation deployed at ${implementation.address} for ${implementation.receipt.gasUsed}`);
      const implementationContract = new Contract(
        implementation.address,
        implementation.abi
      );

      let data = '0x';
      if (updateMethod) {
        if (!implementationContract[updateMethod]) {
          throw new Error(
            `contract need to implement function ${updateMethod}`
          );
        }
        const txData = await implementationContract.populateTransaction[
          updateMethod
        ](...updateArgs);
        data = txData.data || '0x';
      }

      let proxy = await getDeploymentOrNUll(proxyName);
      if (!proxy) {
        const proxyOptions = {...options}; // ensure no change
        delete proxyOptions.proxy;
        delete proxyOptions.libraries;
        proxyOptions.contract = proxyContract;

        proxyOptions.args = replaceTemplateArgs(proxyArgsTemplate, {
          implementationAddress: implementation.address,
          proxyAdmin,
          data,
        });

        proxy = await _deployOne(proxyName, proxyOptions, true);
        // console.log(`proxy deployed at ${proxy.address} for ${proxy.receipt.gasUsed}`);
      } else {
        let from = options.from;

        const ownerStorage = await provider.getStorageAt(
          proxy.address,
          '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
        );
        const currentOwner = getAddress(`0x${ownerStorage.substr(-40)}`);
        if (currentOwner === AddressZero) {
          if (checkProxyAdmin) {
            throw new Error(
              'The Proxy belongs to no-one. It cannot be upgraded anymore'
            );
          }
        } else if (currentOwner.toLowerCase() !== proxyAdmin.toLowerCase()) {
          throw new Error(
            `To change owner/admin, you need to call the proxy directly, it currently is ${currentOwner}`
          );
        } else {
          from = currentOwner;
        }

        const oldProxy = proxy.abi.find(
          (frag: {name: string}) => frag.name === 'changeImplementation'
        );
        if (oldProxy) {
          upgradeMethod = 'changeImplementation';
          upgradeArgsTemplate = ['{implementation}', '{data}'];
        }

        const proxyAddress = proxy.address;
        const upgradeArgs = replaceTemplateArgs(upgradeArgsTemplate, {
          implementationAddress: implementation.address,
          proxyAdmin,
          data,
          proxyAddress,
        });

        if (!upgradeMethod) {
          throw new Error(`No upgrade method found, cannot make upgrades`);
        }

        let executeReceipt;
        if (proxyAdminName) {
          if (oldProxy) {
            throw new Error(`Old Proxy do not support Proxy Admin contracts`);
          }
          if (!currentProxyAdminOwner) {
            throw new Error(`no currentProxyAdminOwner found in ProxyAdmin`);
          }

          executeReceipt = await execute(
            proxyAdminName,
            {...options, from: currentProxyAdminOwner},
            upgradeMethod,
            ...upgradeArgs
          );
        } else {
          executeReceipt = await execute(
            name,
            {...options, from},
            upgradeMethod,
            ...upgradeArgs
          );
        }
        if (!executeReceipt) {
          throw new Error(`could not execute ${upgradeMethod}`);
        }
      }
      const proxiedDeployment: DeploymentSubmission = {
        ...proxyContract,
        receipt: proxy.receipt,
        address: proxy.address,
        linkedData: options.linkedData,
        abi: mergedABI,
        implementation: implementation.address,
        args: proxy.args,
        execute: updateMethod
          ? {
              methodName: updateMethod,
              args: updateArgs,
            }
          : undefined,
      };
      if (oldDeployment) {
        // TODO reenable history with options
        if (oldDeployment.history) {
          proxiedDeployment.history = proxiedDeployment.history
            ? proxiedDeployment.history.concat([oldDeployment])
            : [oldDeployment];
        }
      }
      await saveDeployment(name, proxiedDeployment);

      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: true,
      };
    } else {
      if (oldDeployment.implementation !== implementation.address) {
        const proxiedDeployment: DeploymentSubmission = {
          ...oldDeployment,
          implementation: implementation.address,
          linkedData: options.linkedData,
          abi: mergedABI,
          execute: updateMethod
            ? {
                methodName: updateMethod,
                args: updateArgs,
              }
            : undefined,
        };

        // TODO reenable history with options
        if (oldDeployment.history) {
          proxiedDeployment.history = proxiedDeployment.history
            ? proxiedDeployment.history.concat([oldDeployment])
            : [oldDeployment];
        }
        await saveDeployment(name, proxiedDeployment);
      }

      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: false,
      };
    }
  }

  async function getProxyOwner(options: DeployOptions) {
    let address = options.from; // admim default to msg.sender
    if (typeof options.proxy === 'object') {
      address = options.proxy.owner || address;
    }
    return getFrom(address);
  }

  async function getDiamondOwner(options: DiamondOptions) {
    let address = options.from; // admim default to msg.sender
    address = options.owner || address;
    return getFrom(address);
  }

  async function getOptionalFrom(from?: string): Promise<{
    address?: Address;
    ethersSigner?: Signer;
    hardwareWallet?: string;
  }> {
    if (!from) {
      return {
        address: from,
        ethersSigner: undefined,
        hardwareWallet: undefined,
      };
    }
    return getFrom(from);
  }

  let ledgerSigner: any; // TODO type

  async function getFrom(from: string): Promise<{
    address: Address;
    ethersSigner: Signer | zk.Signer | TronSigner;
    hardwareWallet?: string;
    unknown: boolean;
  }> {
    let ethersSigner: Signer | zk.Signer | TronSigner | undefined;
    let wallet: Wallet | zk.Wallet | TronSigner | undefined;
    let hardwareWallet: string | undefined = undefined;
    let unknown = false;
    let derivationPath: string | undefined = undefined;

    if (from.length >= 64) {
      if (from.length === 64) {
        from = '0x' + from;
      }
      if (network.zksync) {
        wallet = new zk.Wallet(from, provider as zk.Provider);
        ethersSigner = wallet as unknown as zk.Signer;
      } else if (network.tron) {
        wallet = (provider as TronWeb3Provider).addSigner(from);
        ethersSigner = wallet;
      } else {
        wallet = new Wallet(from, provider);
        ethersSigner = wallet;
      }
      from = wallet.address;
    } else {
      if (availableAccounts[from.toLowerCase()]) {
        ethersSigner = provider.getSigner(from);
      } else {
        // TODO register protocol based account as availableAccounts ? if so do not else here
        const registeredProtocol =
          deploymentManager.addressesToProtocol[from.toLowerCase()];
        if (registeredProtocol) {
          if (registeredProtocol === 'external') {
            ethersSigner = provider.getSigner(from); //new WaitingTxSigner(from, provider);
            ethersSigner.sendTransaction = async (
              txRequest: TransactionRequest
            ) => {
              const response: {hash: string} = await enquirer.prompt({
                type: 'input',
                name: 'hash',
                message: `
                tx hash please
                to : ${txRequest.to}
                data : ${txRequest.data}
                value : ${txRequest.value}
                `,
              });

              return provider.getTransaction(response.hash);
            };
            hardwareWallet = 'external';
          } else if (registeredProtocol.startsWith('ledger')) {
            if (!LedgerSigner) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              let error: any | undefined;
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ethersprojectHardwareWalletsModule = require('@ethersproject/hardware-wallets');
                LedgerSigner = ethersprojectHardwareWalletsModule.LedgerSigner;
              } catch (e) {
                error = e;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  andrestEthersLedgerModule = require('@anders-t/ethers-ledger');
                  LedgerSigner = andrestEthersLedgerModule.LedgerSigner;
                  error = undefined;
                } catch (e) {
                  error = e;
                }
              }

              if (error) {
                console.error(
                  `failed to loader hardhware wallet module for ledger, you can either use "@ethersproject/hardware-wallets" which as time of writing does not work or use "@anders-t/ethers-ledger."`
                );
                throw error;
              }
            }

            // make sure to close an existing connection before every transaction since it's currently not being handled
            // properly by ethers
            if (ledgerSigner) {
              const __eth = await ledgerSigner._eth;
              await __eth.transport.device.close();

              ledgerSigner = undefined;
            }

            if (ethersprojectHardwareWalletsModule) {
              derivationPath = getDerivationPath(network.config.chainId);
              ethersSigner = new LedgerSigner(
                provider,
                'default',
                derivationPath
              );
            } else {
              ethersSigner = new LedgerSigner(provider, registeredProtocol);
            }

            ledgerSigner = ethersSigner;
          } else if (registeredProtocol.startsWith('trezor')) {
            if (!TrezorSigner) {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              let error: any | undefined;
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const hardwareWalletModule = require('@nxqbao/eth-signer-trezor');
                derivationPath = getDerivationPath(network.config.chainId);

                if (!derivationPath) {
                  throw new Error(
                    `network is currently unsupported with trezor`
                  );
                }

                TrezorSigner = hardwareWalletModule.TrezorSigner;
              } catch (e) {
                error = e;
              }

              if (error) {
                console.error(
                  `failed to loader hardware wallet module for trezor`
                );
                throw error;
              }
            }

            if (!hardwareSigner) {
              hardwareSigner = new TrezorSigner(
                provider,
                derivationPath,
                undefined, // TODO: support fetch by index
                from,
                'hardhat-deploy-trezor'
              );
            }
            ethersSigner = hardwareSigner;
            hardwareWallet = 'trezor';
          } else if (registeredProtocol.startsWith('privatekey')) {
            ethersSigner = new Wallet(registeredProtocol.substr(13), provider);
          } else if (registeredProtocol.startsWith('gnosis')) {
            ethersSigner = new Wallet(registeredProtocol.substr(13), provider);
          }
        }
      }
    }

    if (!ethersSigner) {
      unknown = true;
      ethersSigner = provider.getSigner(from);
    }

    return {address: from, ethersSigner, hardwareWallet, unknown};
  }

  // async function findEvents(contract: Contract, event: string, blockHash: string): Promise<any[]> {
  //   // TODO type the return type
  //   const filter = contract.filters[event]();
  //   const events = await contract.queryFilter(filter, blockHash);
  //   return events;
  // }

  function sigsFromABI(abi: any[]): string[] {
    return abi
      .filter((fragment: any) => fragment.type === 'function')
      .map((fragment: any) =>
        Interface.getSighash(FunctionFragment.from(fragment))
      );
  }

  async function _deployViaDiamondProxy(
    name: string,
    options: DiamondOptions
  ): Promise<DeployResult> {
    const {isTronNetworkWithTronSolc} = deploymentManager;
    let proxy: Deployment | undefined;
    const proxyName = name + '_DiamondProxy';
    const oldDeployment = await getDeploymentOrNUll(name);
    if (oldDeployment) {
      proxy = await getDeployment(proxyName);
    }
    if (proxy && proxy.deployedBytecode === oldDiamonBase.deployedBytecode) {
      return _old_deployViaDiamondProxy(name, options);
    }

    const deployResult = _checkUpgradeIndex(
      oldDeployment,
      options.upgradeIndex
    );
    if (deployResult) {
      return deployResult;
    }

    let diamondArtifact: ExtendedArtifact = getDefaultArtifact(
      'DiamondBase',
      isTronNetworkWithTronSolc
    );

    if (options.diamondContract) {
      if (typeof options.diamondContract === 'string') {
        diamondArtifact = await partialExtension.getExtendedArtifact(
          options.diamondContract
        );
      } else {
        diamondArtifact = options.diamondContract;
      }
    }

    const {address: owner} = await getDiamondOwner(options);
    const newSelectors: string[] = [];
    const facetSnapshot: Facet[] = [];
    let oldFacets: Facet[] = [];
    if (proxy) {
      const diamondProxy = new Contract(proxy.address, proxy.abi, provider);
      oldFacets = await diamondProxy.facets();
    }
    // console.log({ oldFacets: JSON.stringify(oldFacets, null, "  ") });

    const facetsSet = [...options.facets];
    if (options.defaultCutFacet === undefined || options.defaultCutFacet) {
      facetsSet.push({
        name: '_DefaultDiamondCutFacet',
        contract: getDefaultArtifact(
          'DiamondCutFacet',
          isTronNetworkWithTronSolc
        ),
        args: [],
        deterministic: true,
      });
    }
    if (
      options.defaultOwnershipFacet === undefined ||
      options.defaultOwnershipFacet
    ) {
      facetsSet.push({
        name: '_DefaultDiamondOwnershipFacet',
        contract: getDefaultArtifact(
          'OwnershipFacet',
          isTronNetworkWithTronSolc
        ),
        args: [],
        deterministic: true,
      });
    }
    facetsSet.push({
      name: '_DefaultDiamondLoupeFacet',
      contract: getDefaultArtifact(
        'DiamondLoupeFacet',
        isTronNetworkWithTronSolc
      ),
      args: [],
      deterministic: true,
    });

    let changesDetected = !oldDeployment;
    let abi: any[] = diamondArtifact.abi.concat([]);
    const facetCuts: FacetCut[] = [];
    let facetFound: string | undefined;
    const excludeSelectors: Record<string, string[]> =
      options.excludeSelectors || {};
    for (const facet of facetsSet) {
      let deterministicFacet: string | boolean = true;
      let facetName;
      let artifact;
      let linkedData = options.linkedData;
      let libraries = options.libraries;
      let facetArgs = options.facetsArgs;
      if (typeof facet !== 'string') {
        if (facet.deterministic !== undefined) {
          deterministicFacet = facet.deterministic;
        }
      }
      let argsSpecific = false;
      if (typeof facet === 'string') {
        artifact = await partialExtension.getExtendedArtifact(facet);
        facetName = facet;
      } else {
        if (facet.linkedData) {
          linkedData = facet.linkedData;
        }
        if (facet.libraries) {
          libraries = facet.libraries;
        }
        if (facet.args !== undefined) {
          // TODO fix in master
          facetArgs = facet.args;
          argsSpecific = true;
        }
        if (facet.contract) {
          if (typeof facet.contract === 'string') {
            artifact = await partialExtension.getExtendedArtifact(
              facet.contract
            );
          } else {
            artifact = facet.contract;
          }
        } else {
          if (!facet.name) {
            throw new Error(
              `no name , not contract is specified for facet, cannot proceed`
            );
          }
          artifact = await partialExtension.getExtendedArtifact(facet.name);
        }

        facetName = facet.name;
        if (!facetName) {
          if (typeof facet.contract === 'string') {
            facetName = name + '_facet_' + facet.contract;
          } else {
            throw new Error(`facet has no name, please specify one`);
          }
        }
      }
      const constructor = artifact.abi.find(
        (fragment: {type: string; inputs: any[]}) =>
          fragment.type === 'constructor'
      );
      if (!argsSpecific && (!constructor || constructor.inputs.length === 0)) {
        // reset args for case where facet do not expect any and there was no specific args set on it
        facetArgs = [];
      }
      let excludeSighashes: Set<string> = new Set();
      if (facetName in excludeSelectors) {
        const iface = new Interface(artifact.abi);
        excludeSighashes = new Set(
          excludeSelectors[facetName].map((selector) =>
            iface.getSighash(selector)
          )
        );
      }
      abi = mergeABIs([abi, filterABI(artifact.abi, excludeSighashes)], {
        check: true,
        skipSupportsInterface: false,
      });
      const implementation = await _deployOne(facetName, {
        contract: artifact,
        from: options.from,
        autoMine: options.autoMine,
        estimateGasExtra: options.estimateGasExtra,
        estimatedGasLimit: options.estimatedGasLimit,
        gasPrice: options.gasPrice,
        maxFeePerGas: options.maxFeePerGas,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas,
        log: options.log,
        libraries,
        linkedData,
        args: facetArgs,
        deterministicDeployment: deterministicFacet,
      });
      let facetAddress: string;
      if (implementation.newlyDeployed) {
        // console.log(`facet ${facet} deployed at ${implementation.address}`);
        facetAddress = implementation.address;
        const newFacet = {
          facetAddress,
          functionSelectors: sigsFromABI(
            filterABI(implementation.abi, excludeSighashes)
          ),
        };
        facetSnapshot.push(newFacet);
        newSelectors.push(...newFacet.functionSelectors);
      } else {
        const oldImpl = await getDeployment(facetName);
        facetAddress = oldImpl.address;
        const newFacet = {
          facetAddress,
          functionSelectors: sigsFromABI(
            filterABI(oldImpl.abi, excludeSighashes)
          ),
        };
        facetSnapshot.push(newFacet);
        newSelectors.push(...newFacet.functionSelectors);
      }

      if (options.execute && !options.execute.contract) {
        const methods = artifact.abi.filter(
          (v) => v.name === options.execute?.methodName
        );
        if (methods.length > 0) {
          if (methods.length > 1) {
            throw new Error(
              `multiple method named "${options.execute.methodName}" found in facet`
            );
          } else {
            if (facetFound) {
              throw new Error(
                `multiple facet with method named "${options.execute.methodName}"`
              );
            } else {
              facetFound = facetAddress;
            }
          }
        }
      }
    }

    const oldSelectors: string[] = [];
    const oldSelectorsFacetAddress: {[selector: string]: string} = {};
    for (const oldFacet of oldFacets) {
      for (const selector of oldFacet.functionSelectors) {
        oldSelectors.push(selector);
        oldSelectorsFacetAddress[selector] = oldFacet.facetAddress;
      }
    }

    for (const newFacet of facetSnapshot) {
      const selectorsToAdd: string[] = [];
      const selectorsToReplace: string[] = [];

      for (const selector of newFacet.functionSelectors) {
        // TODO fix in master >0 to transform into >= 0
        if (oldSelectors.indexOf(selector) >= 0) {
          if (
            oldSelectorsFacetAddress[selector].toLowerCase() !==
            newFacet.facetAddress.toLowerCase()
          ) {
            selectorsToReplace.push(selector);
          }
        } else {
          selectorsToAdd.push(selector);
        }
      }

      if (selectorsToReplace.length > 0) {
        changesDetected = true;
        facetCuts.push({
          facetAddress: newFacet.facetAddress,
          functionSelectors: selectorsToReplace,
          action: FacetCutAction.Replace,
        });
      }

      if (selectorsToAdd.length > 0) {
        changesDetected = true;
        facetCuts.push({
          facetAddress: newFacet.facetAddress,
          functionSelectors: selectorsToAdd,
          action: FacetCutAction.Add,
        });
      }
    }

    const selectorsToDelete: string[] = [];
    for (const selector of oldSelectors) {
      if (newSelectors.indexOf(selector) === -1) {
        selectorsToDelete.push(selector);
      }
    }

    if (selectorsToDelete.length > 0) {
      changesDetected = true;
      facetCuts.unshift({
        facetAddress: '0x0000000000000000000000000000000000000000',
        functionSelectors: selectorsToDelete,
        action: FacetCutAction.Remove,
      });
    }

    let executeData = '0x';
    let executeAddress = '0x0000000000000000000000000000000000000000';
    if (options.execute) {
      let addressSpecified: string | undefined;
      let executionContract = new Contract(
        '0x0000000000000000000000000000000000000001',
        abi
      );
      if (options.execute.contract) {
        if (typeof options.execute.contract === 'string') {
          const executionDeployment = await _deployOne(
            options.execute.contract,
            {
              from: options.from,
              autoMine: options.autoMine,
              estimateGasExtra: options.estimateGasExtra,
              estimatedGasLimit: options.estimatedGasLimit,
              gasPrice: options.gasPrice,
              maxFeePerGas: options.maxFeePerGas,
              maxPriorityFeePerGas: options.maxPriorityFeePerGas,
              log: options.log,
              deterministicDeployment: true,
            }
          );
          executionContract = new Contract(
            executionDeployment.address,
            executionDeployment.abi
          );
          addressSpecified = executionContract.address;
        } else {
          const executionDeployment = await _deployOne(
            options.execute.contract.name,
            {
              from: options.from,
              contract: options.execute.contract.artifact,
              args: options.execute.contract.args,
              autoMine: options.autoMine,
              estimateGasExtra: options.estimateGasExtra,
              estimatedGasLimit: options.estimatedGasLimit,
              gasPrice: options.gasPrice,
              maxFeePerGas: options.maxFeePerGas,
              maxPriorityFeePerGas: options.maxPriorityFeePerGas,
              log: options.log,
              deterministicDeployment: true,
            }
          );
          executionContract = new Contract(
            executionDeployment.address,
            executionDeployment.abi
          );
        }
      }
      const txData = await executionContract.populateTransaction[
        options.execute.methodName
      ](...options.execute.args);
      executeData = txData.data || '0x';
      executeAddress =
        addressSpecified ||
        facetFound ||
        '0x0000000000000000000000000000000000000000';
    }

    if (changesDetected) {
      if (!proxy) {
        // TODO initializations only in case of new diamond
        // upgrade skip these

        // const initializations = [];

        // const interfaceList = ['0x']; // TODO
        // if (options.defaultCutFacet) {
        //   interfaceList.push('0x'); // TODO
        // }
        // if (options.defaultOwnershipFacet) {
        //   interfaceList.push('0x'); // TODO
        // }
        // const diamondERC165InitDeployment = await _deployOne(
        //   '_DiamondERC165Init',
        //   {
        //     from: options.from,
        //     deterministicDeployment: true,
        //     contract: diamondERC165Init,
        //     autoMine: options.autoMine,
        //     estimateGasExtra: options.estimateGasExtra,
        //     estimatedGasLimit: options.estimatedGasLimit,
        //     gasPrice: options.gasPrice,
        //     maxFeePerGas: options.maxFeePerGas,
        //     maxPriorityFeePerGas: options.maxPriorityFeePerGas,
        //     log: options.log,
        //   }
        // );
        // const diamondERC165InitContract = new Contract(
        //   diamondERC165InitDeployment.address,
        //   diamondERC165InitDeployment.abi
        // );
        // const interfaceInitTx =
        //   await diamondERC165InitContract.populateTransaction.setERC165(
        //     interfaceList,
        //     []
        //   );
        // initializations.push({
        //   initContract: diamondERC165InitDeployment.address,
        //   initData: interfaceInitTx.data,
        // });
        // if (executeData) {
        //   initializations.push({
        //     initContract: executeData,
        //     initData: executeAddress,
        //   });
        // }
        // const diamondConstructorArgs = [owner, facetCuts, initializations];

        const diamondConstructorArgs = options.diamondContractArgs || [
          '{owner}',
          '{facetCuts}',
          '{initializations}',
        ];

        const initializationsArgIndex =
          diamondConstructorArgs.indexOf('{initializations}');
        const erc165InitArgIndex = diamondConstructorArgs.indexOf('{erc165}');
        const initArgIndex = diamondConstructorArgs.indexOf('{init}');
        const initAddressArgIndex =
          diamondConstructorArgs.indexOf('{initAddress}');
        const initDataArgIndex = diamondConstructorArgs.indexOf('{initData}');
        const ownerArgIndex = diamondConstructorArgs.indexOf('{owner}');
        const facetCutsArgIndex = diamondConstructorArgs.indexOf('{facetCuts}');
        if (
          initializationsArgIndex >= 0 &&
          (initArgIndex >= 0 ||
            erc165InitArgIndex >= 0 ||
            initDataArgIndex >= 0)
        ) {
          throw new Error(
            `{initializations} found but also one or more of {init} {erc165} {initData}`
          );
        }

        // TODO option to add more to the list
        // else mechanism to set it up differently ? LoupeFacet without supportsInterface
        const interfaceList = ['0x48e2b093'];
        if (options.defaultCutFacet) {
          interfaceList.push('0x1f931c1c');
        }
        if (options.defaultOwnershipFacet) {
          interfaceList.push('0x7f5828d0');
        }

        if (initializationsArgIndex >= 0 || erc165InitArgIndex >= 0) {
          const diamondERC165InitDeployment = await _deployOne(
            '_DefaultDiamondERC165Init',
            {
              from: options.from,
              deterministicDeployment: true,
              contract: getDefaultArtifact(
                'DiamondERC165Init',
                isTronNetworkWithTronSolc
              ),
              autoMine: options.autoMine,
              estimateGasExtra: options.estimateGasExtra,
              estimatedGasLimit: options.estimatedGasLimit,
              gasPrice: options.gasPrice,
              maxFeePerGas: options.maxFeePerGas,
              maxPriorityFeePerGas: options.maxPriorityFeePerGas,
              log: options.log,
            }
          );
          const diamondERC165InitContract = new Contract(
            diamondERC165InitDeployment.address,
            diamondERC165InitDeployment.abi
          );
          const interfaceInitTx =
            await diamondERC165InitContract.populateTransaction.setERC165(
              interfaceList,
              []
            );
          if (initializationsArgIndex >= 0) {
            const initializations = [];
            initializations.push({
              initContract: interfaceInitTx.to,
              initData: interfaceInitTx.data,
            });
            diamondConstructorArgs[initializationsArgIndex] = initializations;
          } else {
            diamondConstructorArgs[erc165InitArgIndex] = {
              initContract: interfaceInitTx.to,
              initData: interfaceInitTx.data,
            };
          }
        }

        if (ownerArgIndex >= 0) {
          diamondConstructorArgs[ownerArgIndex] = owner;
        } else {
          // TODO ?
        }

        if (facetCutsArgIndex >= 0) {
          diamondConstructorArgs[facetCutsArgIndex] = facetCuts;
        } else {
          throw new Error(`diamond constructor needs a {facetCuts} argument`);
        }

        if (executeData) {
          if (initializationsArgIndex >= 0) {
            if (executeData !== '0x') {
              diamondConstructorArgs[initializationsArgIndex].push({
                initContract: executeAddress,
                initData: executeData,
              });
            }
          } else {
            if (initArgIndex >= 0) {
              diamondConstructorArgs[initArgIndex] = {
                initContract: executeAddress,
                initData: executeData,
              };
            } else if (initDataArgIndex >= 0) {
              diamondConstructorArgs[initDataArgIndex] = executeData;
              if (initAddressArgIndex >= 0) {
                diamondConstructorArgs[initAddressArgIndex] = executeAddress;
              }
            } else {
              throw new Error(
                `no {init} or {initData} found in list of args even though execute is set in option`
              );
            }
          }
        }

        let deterministicDiamondAlreadyDeployed = false;
        let expectedAddress: string | undefined = undefined;
        let salt =
          '0x0000000000000000000000000000000000000000000000000000000000000000';
        if (typeof options.deterministicSalt !== 'undefined') {
          if (typeof options.deterministicSalt === 'string') {
            if (options.deterministicSalt === salt) {
              throw new Error(
                `deterministicSalt cannot be 0x000..., it needs to be a non-zero bytes32 salt. This is to ensure you are explicitly specyfying different addresses for multiple diamonds`
              );
            } else {
              if (options.deterministicSalt.length !== 66) {
                throw new Error(
                  `deterministicSalt needs to be a string of 66 hexadecimal characters (including the 0x prefix)`
                );
              }
              salt = options.deterministicSalt;

              const factory = new DeploymentFactory(
                getArtifact,
                diamondArtifact,
                diamondConstructorArgs,
                network
              );

              const create2DeployerAddress =
                await deploymentManager.getDeterministicDeploymentFactoryAddress();
              expectedAddress = await factory.getCreate2Address(
                create2DeployerAddress,
                salt
              );
              const code = await provider.getCode(expectedAddress);
              if (code !== '0x') {
                deterministicDiamondAlreadyDeployed = true;
              }
            }
          } else {
            throw new Error(
              `deterministicSalt need to be a string, an non-zero bytes32 salt`
            );
          }
        }

        if (expectedAddress && deterministicDiamondAlreadyDeployed) {
          proxy = {
            ...diamondArtifact,
            address: expectedAddress,
            args: diamondConstructorArgs,
          };
          await saveDeployment(proxyName, proxy);
          await saveDeployment(name, {
            ...proxy,
            linkedData: options.linkedData,
            facets: facetSnapshot,
            abi,
          });
          await _deployViaDiamondProxy(name, options); // this would not recurse again as the name and proxyName are now saved
        } else {
          proxy = await _deployOne(proxyName, {
            contract: diamondArtifact,
            from: options.from,
            args: diamondConstructorArgs,
            autoMine: options.autoMine,
            deterministicDeployment: options.deterministicSalt,
            estimateGasExtra: options.estimateGasExtra,
            estimatedGasLimit: options.estimatedGasLimit,
            gasLimit: options.gasLimit,
            gasPrice: options.gasPrice,
            log: options.log,
            nonce: options.nonce,
            maxFeePerGas: options.maxFeePerGas,
            maxPriorityFeePerGas: options.maxPriorityFeePerGas,
            value: options.value,
          });

          await saveDeployment(proxyName, {...proxy, abi});
          await saveDeployment(name, {
            ...proxy,
            linkedData: options.linkedData,
            facets: facetSnapshot,
            abi,
            execute: options.execute,
          });
        }
      } else {
        if (!oldDeployment) {
          throw new Error(`Cannot find Deployment for ${name}`);
        }
        const currentOwner = await read(proxyName, 'owner');
        if (currentOwner.toLowerCase() !== owner.toLowerCase()) {
          throw new Error(
            'To change owner, you need to call `transferOwnership`'
          );
        }
        if (currentOwner === AddressZero) {
          throw new Error(
            'The Diamond belongs to no-one. It cannot be upgraded anymore'
          );
        }

        const executeReceipt = await execute(
          name,
          {...options, from: currentOwner},
          'diamondCut',
          facetCuts,
          executeData === '0x'
            ? '0x0000000000000000000000000000000000000000'
            : executeAddress || proxy.address, // TODO  || proxy.address should not be required, the facet should have been found
          executeData
        );
        if (!executeReceipt) {
          throw new Error('failed to execute');
        }

        const diamondDeployment: DeploymentSubmission = {
          ...oldDeployment,
          linkedData: options.linkedData,
          address: proxy.address,
          abi,
          facets: facetSnapshot,
          execute: options.execute, // TODO add receipt + tx hash
        };

        // TODO reenable history with options
        if (oldDeployment.history) {
          diamondDeployment.history = diamondDeployment.history
            ? diamondDeployment.history.concat([oldDeployment])
            : [oldDeployment];
        }

        await saveDeployment(name, diamondDeployment);
      }

      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: true,
      };
    } else {
      // const oldDeployment = await partialExtension.get(name);

      // const proxiedDeployment: DeploymentSubmission = {
      //   ...oldDeployment,
      //   facets: facetSnapshot,
      //   abi,
      //   execute: options.execute,
      // };
      // // TODO ?
      // // proxiedDeployment.history = proxiedDeployment.history
      // //   ? proxiedDeployment.history.concat([oldDeployment])
      // //   : [oldDeployment];
      // await saveDeployment(name, proxiedDeployment);

      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: false,
      };
    }
  }

  async function deploy(
    name: string,
    options: DeployOptions
  ): Promise<DeployResult> {
    options = {...options}; // ensure no change
    await init();
    if (!options.proxy) {
      return _deployOne(name, options);
    }
    return _deployViaProxy(name, options);
  }

  async function diamond(
    name: string,
    options: DiamondOptions
  ): Promise<DeployResult> {
    options = {...options}; // ensure no change
    await init();
    return _deployViaDiamondProxy(name, options);
  }

  async function rawTx(tx: SimpleTx): Promise<Receipt> {
    tx = {...tx};
    await init();
    const {
      address: from,
      ethersSigner,
      hardwareWallet,
      unknown,
    } = await getFrom(tx.from);

    const transactionData = {
      to: tx.to,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice ? BigNumber.from(tx.gasPrice) : undefined,
      maxFeePerGas: tx.maxFeePerGas
        ? BigNumber.from(tx.maxFeePerGas)
        : undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
        ? BigNumber.from(tx.maxPriorityFeePerGas)
        : undefined,
      value: tx.value ? BigNumber.from(tx.value) : undefined,
      nonce: tx.nonce,
      data: tx.data,
    };

    await overrideGasLimit(transactionData, tx, (newOverrides) =>
      ethersSigner.estimateGas(newOverrides)
    );
    await setupGasPrice(transactionData);
    await setupNonce(from, transactionData);

    if (unknown) {
      throw new UnknownSignerError({
        from,
        ...transactionData,
      });
    }

    if (hardwareWallet) {
      log(` please confirm on your ${hardwareWallet}`);
    }
    let pendingTx = (await handleSpecificErrors(
      ethersSigner.sendTransaction(transactionData)
    )) as TransactionResponse;
    pendingTx = await onPendingTx(pendingTx);
    if (tx.autoMine) {
      try {
        await provider.send('evm_mine', []);
      } catch (e) {}
    }
    return pendingTx.wait();
  }

  async function catchUnknownSigner(
    action: Promise<any> | (() => Promise<any>),
    options?: {log?: boolean}
  ): Promise<null | {
    from: string;
    to?: string;
    value?: string;
    data?: string;
  }> {
    const outputLog = !options || options.log === undefined || options.log;
    try {
      if (action instanceof Promise) {
        await action;
      } else {
        await action();
      }
    } catch (e) {
      if (e instanceof UnknownSignerError) {
        const {from, to, data, value, contract} = e.data;
        if (outputLog) {
          console.log(
            `---------------------------------------------------------------------------------------`
          );
          console.error('no signer for ' + from);
          console.log(`Please execute the following:`);
          console.log(
            `---------------------------------------------------------------------------------------`
          );
          if (contract) {
            console.log(
              `
from: ${from}
to: ${to} (${contract.name})${
                value
                  ? '\nvalue: ' +
                    (typeof value === 'string' ? value : value.toString())
                  : ''
              }
method: ${contract.method}
args:
  - ${contract.args.join('\n  - ')}

(raw data: ${data} )
`
            );
          } else {
            console.log(
              `
from: ${from}
to: ${to ? to : '0x0000000000000000000000000000000000000000'}${
                value
                  ? '\nvalue: ' +
                    (typeof value === 'string' ? value : value.toString())
                  : ''
              }
data: ${data}
`
            );
          }
          console.log(
            `---------------------------------------------------------------------------------------`
          );
        }
        if (!value || typeof value === 'string') {
          return {from, to, value, data};
        }
        return {from, to, value: value?.toString(), data};
      } else {
        throw e;
      }
    }
    return null;
  }

  async function execute(
    name: string,
    options: TxOptions,
    methodName: string,
    ...args: any[]
  ): Promise<Receipt> {
    options = {...options}; // ensure no change
    await init();
    const {
      address: from,
      ethersSigner,
      hardwareWallet,
      unknown,
    } = await getFrom(options.from);

    let tx;
    const deployment = await partialExtension.get(name);
    const abi = deployment.abi;
    const overrides = {
      gasLimit: options.gasLimit,
      gasPrice: options.gasPrice ? BigNumber.from(options.gasPrice) : undefined, // TODO cinfig
      maxFeePerGas: options.maxFeePerGas
        ? BigNumber.from(options.maxFeePerGas)
        : undefined,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas
        ? BigNumber.from(options.maxPriorityFeePerGas)
        : undefined,
      value: options.value ? BigNumber.from(options.value) : undefined,
      nonce: options.nonce,
    };

    const ethersContract = new Contract(deployment.address, abi, ethersSigner);
    if (!ethersContract.functions[methodName]) {
      throw new Error(
        `No method named "${methodName}" on contract deployed as "${name}"`
      );
    }

    const numArguments =
      ethersContract.interface.getFunction(methodName).inputs.length;
    if (args.length !== numArguments) {
      throw new Error(
        `expected ${numArguments} arguments for method "${methodName}", got ${args.length}`
      );
    }

    await overrideGasLimit(overrides, options, (newOverrides) => {
      const ethersArgsWithGasLimit = args
        ? args.concat([newOverrides])
        : [newOverrides];
      return ethersContract.estimateGas[methodName](...ethersArgsWithGasLimit);
    });
    await setupGasPrice(overrides);
    await setupNonce(from, overrides);
    const ethersArgs = args ? args.concat([overrides]) : [overrides];

    if (unknown) {
      const ethersArgs = args ? args.concat([overrides]) : [overrides];
      const {data} = await ethersContract.populateTransaction[methodName](
        ...ethersArgs
      );
      throw new UnknownSignerError({
        from,
        to: deployment.address,
        data,
        value: options.value,
        contract: {
          name,
          method: methodName,
          args,
        },
      });
    }

    if (options.log || hardwareWallet) {
      print(`executing ${name}.${methodName}`);
      if (hardwareWallet) {
        print(` (please confirm on your ${hardwareWallet})`);
      }
    }

    if (network.tron) {
      const method = ethersContract.interface.getFunction(methodName);
      const methodParams = method.inputs.map((input) => input.type);
      const funcSig = `${methodName}(${methodParams.join(',')})`;
      const tronArgs = args.map((a, i) => ({
        type: methodParams[i],
        value: a,
      }));
      tx = await handleSpecificErrors(
        (ethersSigner.provider as TronWeb3Provider).triggerSmartContract(
          from,
          deployment.address,
          funcSig,
          tronArgs,
          overrides
        )
      );
    } else {
      tx = await handleSpecificErrors(
        ethersContract.functions[methodName](...ethersArgs)
      );
    }
    tx = await onPendingTx(tx);

    if (options.log || hardwareWallet) {
      print(` (tx: ${tx.hash}) ...`);
    }

    if (options.autoMine) {
      try {
        await provider.send('evm_mine', []);
      } catch (e) {}
    }
    const receipt = await tx.wait();
    if (options.log || hardwareWallet) {
      print(`: performed with ${receipt.gasUsed} gas\n`);
    }
    return receipt;
  }

  // TODO ?
  // async function rawCall(to: string, data: string) {
  //   // TODO call it eth_call?
  //   await init();
  //   return provider.send("eth_call", [
  //     {
  //       to,
  //       data
  //     },
  //     "latest"
  //   ]); // TODO overrides
  // }

  async function read(
    name: string,
    options: CallOptions | string,
    methodName?: string | any,
    ...args: unknown[]
  ) {
    if (typeof options === 'string') {
      if (typeof methodName !== 'undefined') {
        args.unshift(methodName);
      }
      methodName = options;
      options = {};
    }
    options = {...options}; // ensure no change
    await init();
    if (typeof args === 'undefined') {
      args = [];
    }
    let caller:
      | Web3Provider
      | Signer
      | zk.Web3Provider
      | zk.Signer
      | TronWeb3Provider
      | TronSigner = provider;
    const {ethersSigner} = await getOptionalFrom(options.from);
    if (ethersSigner) {
      caller = ethersSigner;
    }
    const deployment = await partialExtension.get(name);
    if (!deployment) {
      throw new Error(`no contract named "${name}"`);
    }
    const abi = deployment.abi;
    const overrides: PayableOverrides = {
      gasLimit: options.gasLimit,
      gasPrice: options.gasPrice ? BigNumber.from(options.gasPrice) : undefined, // TODO cinfig
      maxFeePerGas: options.maxFeePerGas
        ? BigNumber.from(options.maxFeePerGas)
        : undefined,
      maxPriorityFeePerGas: options.maxPriorityFeePerGas
        ? BigNumber.from(options.maxPriorityFeePerGas)
        : undefined,
      value: options.value ? BigNumber.from(options.value) : undefined,
      nonce: options.nonce,
    };
    cleanupOverrides(overrides);
    const ethersContract = new Contract(
      deployment.address,
      abi,
      caller as Signer
    );
    // populate function
    // if (options.outputTx) {
    //   const method = ethersContract.populateTransaction[methodName];
    //   if (!method) {
    //     throw new Error(
    //       `no method named "${methodName}" on contract "${name}"`
    //     );
    //   }
    //   if (args.length > 0) {
    //     return method(...args, overrides);
    //   } else {
    //     return method(overrides);
    //   }
    // }
    const method = ethersContract.callStatic[methodName];
    if (!method) {
      throw new Error(`no method named "${methodName}" on contract "${name}"`);
    }
    if (args.length > 0) {
      return method(...args, overrides);
    } else {
      return method(overrides);
    }
  }
  async function getSigner(address: string): Promise<Signer> {
    await init();
    const {ethersSigner} = await getFrom(address);
    return ethersSigner;
  }

  const extension: DeploymentsExtension = {
    ...partialExtension,
    fetchIfDifferent,
    deploy, // tron compatible
    diamond: {
      deploy: diamond,
    },
    catchUnknownSigner,
    execute, // tron compatible
    rawTx,
    read, // tron compatible
    deterministic, // won't support tron (contracts addresses are dependent on timestamps)
    getSigner, // tron compatible
  };

  const utils = {
    dealWithPendingTransactions: async (
      pendingTxs: {
        [txHash: string]: {
          name: string;
          deployment?: any;
          rawTx: string;
          decoded: {
            from: string;
            gasPrice?: string;
            maxFeePerGas?: string | BigNumber;
            maxPriorityFeePerGas?: string | BigNumber;
            gasLimit: string;
            to: string;
            value: string;
            nonce: number;
            data: string;
            r: string;
            s: string;
            v: number;
            // creates: tx.creates, // TODO test
            chainId: number;
          };
        };
      },
      pendingTxPath: string,
      globalGasPrice: string | undefined
    ) => {
      await init();
      const txHashes = Object.keys(pendingTxs);
      for (const txHash of txHashes) {
        let tx: Transaction | undefined;
        const txData = pendingTxs[txHash];
        if (txData.rawTx || txData.decoded) {
          if (txData.rawTx) {
            tx = parseTransaction(txData.rawTx);
          } else {
            tx = recode(txData.decoded);
          }
          // alternative add options to deploy task to delete pending tx, combined with --gasprice this would work (except for timing edge case)
        } else {
          console.error(`no access to raw data for tx ${txHash}`);
        }

        const txFromPeers = await network.provider.send(
          'eth_getTransactionByHash',
          [txHash]
        );

        let feeHistory:
          | {
              baseFeePerGas: string[];
              gasUsedRatio?: number[]; // not documented on https://playground.open-rpc.org/?schemaUrl=https://raw.githubusercontent.com/ethereum/eth1.0-apis/assembled-spec/openrpc.json&uiSchema%5BappBar%5D%5Bui:splitView%5D=false&uiSchema%5BappBar%5D%5Bui:input%5D=false&uiSchema%5BappBar%5D%5Bui:examplesDropdown%5D=false
              oldestBlock: number;
              reward: string[][];
            }
          | undefined = undefined;
        let newGasPriceS = globalGasPrice;
        if (!newGasPriceS) {
          newGasPriceS = await network.provider.send('eth_gasPrice', []);
          try {
            feeHistory = await network.provider.send('eth_feeHistory', [
              4,
              'latest',
              [25, 75],
            ]);
          } catch (e) {}
        }
        const newGasPrice = BigNumber.from(newGasPriceS);

        let newBaseFee: BigNumber | undefined = undefined;
        if (feeHistory) {
          newBaseFee = BigNumber.from(
            feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]
          );
        }

        const choices = ['skip (forget tx)'];
        if (!txFromPeers) {
          if (tx) {
            choices.unshift('broadcast again');
          }
          console.log(`transaction ${txHash} cannot be found among peers`);
        } else {
          choices.unshift('continue waiting');
          if (tx) {
            console.log(
              `transaction ${txHash} still pending... It used a gas pricing config of ${
                tx.gasPrice
                  ? `(gasPrice: ${tx.gasPrice.toString()} wei)`
                  : tx.maxPriorityFeePerGas || tx.maxPriorityFeePerGas
                  ? `maxPriorityFeePerGas: ${tx.maxPriorityFeePerGas?.toString()} maxFeePerGas: ${tx.maxFeePerGas?.toString()}`
                  : ``
              } ,
              current gas price is ${newGasPrice.toString()} wei
              ${newBaseFee ? `new baseFee is ${newBaseFee.toString()}` : ''}
              `
            );
          } else {
            console.log(`transaction ${txHash} still pending...`);
          }
        }

        if (tx && tx.gasPrice && tx.gasPrice.lt(newGasPrice)) {
          choices.unshift('increase gas');
        } else if (tx && (tx.maxFeePerGas || tx.maxPriorityFeePerGas)) {
          // choices.unshift(); // TODO
          // console.log('TODO handle EIP1559 gas pricing increase');
          choices.unshift('increase gas');
        }

        const prompt = new (enquirer as any).Select({
          name: 'action',
          message: 'Choose what to do with the pending transaction:',
          choices,
        });

        const answer = await prompt.run();
        let txHashToWait: string | undefined;
        if (answer !== 'skip (forget tx)') {
          if (answer === 'continue waiting') {
            console.log('waiting for transaction...');
            txHashToWait = txHash;
          } else if (answer === 'broadcast again') {
            if (!tx) {
              throw new Error(`cannot resubmit a tx if info not available`);
            }

            if (txData.rawTx) {
              const tx = (await handleSpecificErrors(
                provider.sendTransaction(txData.rawTx)
              )) as TransactionResponse;
              txHashToWait = tx.hash;
              if (tx.hash !== txHash) {
                console.error('non mathcing tx hashes after resubmitting...');
              }
              console.log('waiting for newly broadcasted tx ...');
            } else {
              console.log('resigning the tx...');
              const {ethersSigner, hardwareWallet} = await getOptionalFrom(
                tx.from
              );
              if (!ethersSigner) {
                throw new Error('no signer for ' + tx.from);
              }

              if (hardwareWallet) {
                print(` (please confirm on your ${hardwareWallet})`);
              }

              const txReq = await handleSpecificErrors(
                ethersSigner.sendTransaction(
                  cleanupOverrides({
                    to: tx.to,
                    from: tx.from,
                    nonce: tx.nonce,

                    gasLimit: tx.gasLimit,
                    gasPrice: tx.gasPrice,
                    maxFeePerGas: tx.maxFeePerGas,
                    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,

                    data: tx.data,
                    value: tx.value,
                    chainId: tx.chainId,
                    type: tx.type === null ? undefined : tx.type,
                    accessList: tx.accessList,
                  })
                )
              );
              txHashToWait = txReq.hash;
              if (txReq.hash !== txHash) {
                delete pendingTxs[txHash];
                if (Object.keys(pendingTxs).length === 0) {
                  fs.removeSync(pendingTxPath);
                } else {
                  fs.writeFileSync(
                    pendingTxPath,
                    JSON.stringify(pendingTxs, bnReplacer, '  ')
                  );
                }
                await onPendingTx(txReq);
                console.error('non mathcing tx hashes after resubmitting...');
              }
            }
          } else if (answer === 'increase gas') {
            if (!tx) {
              throw new Error(`cannot resubmit a tx if info not available`);
            }
            const {ethersSigner, hardwareWallet} = await getOptionalFrom(
              tx.from
            );
            if (!ethersSigner) {
              throw new Error('no signer for ' + tx.from);
            }

            if (hardwareWallet) {
              print(` (please confirm on your ${hardwareWallet})`);
            }

            const gasPriceSetup = await getGasPrice();
            const maxFeePerGas = gasPriceSetup.maxFeePerGas;
            const maxPriorityFeePerGas = gasPriceSetup.maxPriorityFeePerGas;
            let gasPrice: BigNumber | undefined;
            if (!maxFeePerGas && !maxPriorityFeePerGas) {
              gasPrice = gasPriceSetup.gasPrice;
              if (gasPrice) {
                console.log('using legacy gasPrice with gasprice passed in');
              }
            }
            // if (!gasPrice && !maxFeePerGas && !maxPriorityFeePerGas) {
            //   console.log('using legacy gasPrice, TODO handle auto pricing')
            //   gasPrice = newGasPrice;
            // }

            const txReq = await handleSpecificErrors(
              ethersSigner.sendTransaction(
                cleanupOverrides({
                  to: tx.to,
                  from: tx.from,
                  nonce: tx.nonce,

                  gasLimit: tx.gasLimit,
                  gasPrice,
                  maxFeePerGas,
                  maxPriorityFeePerGas,

                  data: tx.data,
                  value: tx.value,
                  chainId: tx.chainId,
                  type: tx.type === null ? undefined : tx.type,
                  accessList: tx.accessList,
                })
              )
            );
            txHashToWait = txReq.hash;
            delete pendingTxs[txHash];
            if (Object.keys(pendingTxs).length === 0) {
              fs.removeSync(pendingTxPath);
            } else {
              fs.writeFileSync(
                pendingTxPath,
                JSON.stringify(pendingTxs, bnReplacer, '  ')
              );
            }
            await onPendingTx(txReq);
            console.log(`new transaction submitted, waiting... ${txReq.hash}`);
          }
        }

        if (txHashToWait) {
          const receipt = await waitForTx(
            network.provider,
            txHashToWait,
            false
          );
          if (
            (!receipt.status || receipt.status == 1) && // ensure we do not save failed deployment
            receipt.contractAddress &&
            txData.name
          ) {
            await saveDeployment(txData.name, {
              ...txData.deployment,
              receipt,
            });
          }
        }

        delete pendingTxs[txHash];
        if (Object.keys(pendingTxs).length === 0) {
          fs.removeSync(pendingTxPath);
        } else {
          fs.writeFileSync(
            pendingTxPath,
            JSON.stringify(pendingTxs, bnReplacer, '  ')
          );
        }
      }
    },
  };

  // ////////// Backward compatible for transition: //////////////////
  (extension as any).call = (
    options: any,
    name: string,
    methodName: string,
    ...args: any[]
  ): Promise<any> => {
    if (typeof options === 'string') {
      args = args || [];
      if (methodName !== undefined) {
        args.unshift(methodName);
      }
      methodName = name;
      name = options;
      options = {};
    }
    return read(name, options, methodName, ...args);
  };

  (extension as any).sendTxAndWait = (
    options: TxOptions,
    name: string,
    methodName: string,
    ...args: any[]
  ): Promise<Receipt | null> => {
    return execute(name, options, methodName, ...args);
  };

  (extension as any).deployIfDifferent = (
    name: string,
    options: DeployOptions,
    contractName: string,
    ...args: any[]
  ): Promise<DeployResult> => {
    options.contract = contractName;
    options.args = args;
    return deploy(name, options);
  };
  // ////////////////////////////////////////////////////////////////////

  async function _old_deployViaDiamondProxy(
    name: string,
    options: DiamondOptions
  ): Promise<DeployResult> {
    if (options.log) {
      log(`handling old diamond ${name} ...`);
    }
    const oldDeployment = await getDeploymentOrNUll(name);
    let proxy: Deployment | undefined;
    const deployResult = _checkUpgradeIndex(
      oldDeployment,
      options.upgradeIndex
    );
    if (deployResult) {
      return deployResult;
    }

    if (options.deterministicSalt) {
      throw new Error(`old diamonds do not support determinsitc deployment`);
      // need to compute the resulting address accurately
    }

    const proxyName = name + '_DiamondProxy';
    const {address: owner} = await getDiamondOwner(options);
    const newSelectors: string[] = [];
    const facetSnapshot: Facet[] = [];
    const oldFacets: Facet[] = [];
    const selectorToNotTouch: {[selector: string]: boolean} = {};
    for (const selector of [
      '0xcdffacc6',
      '0x52ef6b2c',
      '0xadfca15e',
      '0x7a0ed627',
      '0x01ffc9a7',
      '0x1f931c1c',
      '0xf2fde38b',
      '0x8da5cb5b',
    ]) {
      selectorToNotTouch[selector] = true;
    }
    if (oldDeployment) {
      proxy = await getDeployment(proxyName);
      const diamondProxy = new Contract(proxy.address, proxy.abi, provider);

      const currentFacets: Facet[] = await diamondProxy.facets();
      for (const currentFacet of currentFacets) {
        oldFacets.push(currentFacet);

        // ensure DiamondLoupeFacet, OwnershipFacet and DiamondCutFacet are kept // TODO options to delete cut them out?
        if (
          findAll(
            [
              '0xcdffacc6',
              '0x52ef6b2c',
              '0xadfca15e',
              '0x7a0ed627',
              '0x01ffc9a7',
            ],
            currentFacet.functionSelectors
          ) || // Loupe
          currentFacet.functionSelectors[0] === '0x1f931c1c' || // DiamoncCut
          findAll(['0xf2fde38b', '0x8da5cb5b'], currentFacet.functionSelectors) // ERC173
        ) {
          facetSnapshot.push(currentFacet);
          newSelectors.push(...currentFacet.functionSelectors);
        }
      }
    } else {
      throw new Error(`old diamond deployments are now disabled`);
    }
    // console.log({ oldFacets: JSON.stringify(oldFacets, bnReplacer, "  ") });

    let changesDetected = !oldDeployment;
    let abi: any[] = oldDiamonBase.abi.concat([]);
    const facetCuts: FacetCut[] = [];
    for (const facet of options.facets) {
      let facetName;
      let artifact;
      let linkedData = options.linkedData;
      let libraries = options.libraries;
      let facetArgs = options.facetsArgs;
      let argsSpecific = false;
      if (typeof facet === 'string') {
        artifact = await partialExtension.getExtendedArtifact(facet);
        facetName = facet;
      } else {
        if (facet.linkedData) {
          linkedData = facet.linkedData;
        }
        if (facet.libraries) {
          libraries = facet.libraries;
        }
        if (facet.args) {
          facetArgs = facet.args;
          argsSpecific = true;
        }
        if (facet.contract) {
          if (typeof facet.contract === 'string') {
            artifact = await partialExtension.getExtendedArtifact(
              facet.contract
            );
          } else {
            artifact = facet.contract;
          }
        } else {
          if (!facet.name) {
            throw new Error(
              `no name , not contract is specified for facet, cannot proceed`
            );
          }
          artifact = await partialExtension.getExtendedArtifact(facet.name);
        }

        facetName = facet.name;
        if (!facetName) {
          if (typeof facet.contract === 'string') {
            facetName = name + '_facet_' + facet.contract;
          } else {
            throw new Error(`facet has no name, please specify one`);
          }
        }
      }
      const constructor = artifact.abi.find(
        (fragment: {type: string; inputs: any[]}) =>
          fragment.type === 'constructor'
      );
      if ((!argsSpecific && !constructor) || constructor.inputs.length === 0) {
        // reset args for case where facet do not expect any and there was no specific args set on it
        facetArgs = [];
      }
      abi = mergeABIs([abi, artifact.abi], {
        check: true,
        skipSupportsInterface: false,
      });
      // TODO allow facet to be named so multiple version could coexist
      const implementation = await _deployOne(facetName, {
        contract: artifact,
        from: options.from,
        autoMine: options.autoMine,
        estimateGasExtra: options.estimateGasExtra,
        estimatedGasLimit: options.estimatedGasLimit,
        gasPrice: options.gasPrice,
        maxFeePerGas: options.maxFeePerGas,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas,
        log: options.log,
        // deterministicDeployment: options.deterministicDeployment, // todo ?
        libraries,
        linkedData,
        args: facetArgs,
      });
      if (implementation.newlyDeployed) {
        // console.log(`facet ${facet} deployed at ${implementation.address}`);
        const newFacet = {
          facetAddress: implementation.address,
          functionSelectors: sigsFromABI(implementation.abi),
        };
        facetSnapshot.push(newFacet);
        newSelectors.push(...newFacet.functionSelectors);
      } else {
        const oldImpl = await getDeployment(facetName);
        const newFacet = {
          facetAddress: oldImpl.address,
          functionSelectors: sigsFromABI(oldImpl.abi),
        };
        facetSnapshot.push(newFacet);
        newSelectors.push(...newFacet.functionSelectors);
      }
    }

    const oldSelectors: string[] = [];
    const oldSelectorsFacetAddress: {[selector: string]: string} = {};
    for (const oldFacet of oldFacets) {
      for (const selector of oldFacet.functionSelectors) {
        oldSelectors.push(selector);
        oldSelectorsFacetAddress[selector] = oldFacet.facetAddress;
      }
    }

    for (const newFacet of facetSnapshot) {
      const selectorsToAdd: string[] = [];
      const selectorsToReplace: string[] = [];

      for (const selector of newFacet.functionSelectors) {
        if (oldSelectors.indexOf(selector) > 0) {
          if (
            oldSelectorsFacetAddress[selector].toLowerCase() !==
              newFacet.facetAddress.toLowerCase() &&
            !selectorToNotTouch[selector]
          ) {
            selectorsToReplace.push(selector);
          }
        } else {
          if (!selectorToNotTouch[selector]) {
            selectorsToAdd.push(selector);
          }
        }
      }

      if (selectorsToReplace.length > 0) {
        changesDetected = true;
        facetCuts.push({
          facetAddress: newFacet.facetAddress,
          functionSelectors: selectorsToReplace,
          action: FacetCutAction.Replace,
        });
      }

      if (selectorsToAdd.length > 0) {
        changesDetected = true;
        facetCuts.push({
          facetAddress: newFacet.facetAddress,
          functionSelectors: selectorsToAdd,
          action: FacetCutAction.Add,
        });
      }
    }

    const selectorsToDelete: string[] = [];
    for (const selector of oldSelectors) {
      if (newSelectors.indexOf(selector) === -1) {
        selectorsToDelete.push(selector);
      }
    }

    if (selectorsToDelete.length > 0) {
      changesDetected = true;
      facetCuts.unshift({
        facetAddress: '0x0000000000000000000000000000000000000000',
        functionSelectors: selectorsToDelete,
        action: FacetCutAction.Remove,
      });
    }

    let data = '0x';
    if (options.execute) {
      const diamondContract = new Contract(
        '0x0000000000000000000000000000000000000001',
        abi
      );
      const txData = await diamondContract.populateTransaction[
        options.execute.methodName
      ](...options.execute.args);
      data = txData.data || '0x';
    }

    if (changesDetected) {
      if (!proxy) {
        throw new Error(
          `no proxy found: old diamond deployments are now disabled`
        );
      } else {
        const currentOwner = await read(proxyName, 'owner');
        if (currentOwner.toLowerCase() !== owner.toLowerCase()) {
          throw new Error(
            'To change owner, you need to call `transferOwnership`'
          );
        }
        if (currentOwner === AddressZero) {
          throw new Error(
            'The Diamond belongs to no-one. It cannot be upgraded anymore'
          );
        }

        const executeReceipt = await execute(
          name,
          {...options, from: currentOwner},
          'diamondCut',
          facetCuts,
          data === '0x'
            ? '0x0000000000000000000000000000000000000000'
            : proxy.address,
          data
        );
        if (!executeReceipt) {
          throw new Error('failed to execute');
        }

        const diamondDeployment: DeploymentSubmission = {
          ...oldDeployment,
          linkedData: options.linkedData,
          address: proxy.address,
          abi,
          facets: facetSnapshot,
          execute: options.execute, // TODO add receipt + tx hash
        };

        // TODO reenable history with options
        if (oldDeployment.history) {
          diamondDeployment.history = diamondDeployment.history
            ? diamondDeployment.history.concat([oldDeployment])
            : [oldDeployment];
        }

        await saveDeployment(name, diamondDeployment);
      }

      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: true,
      };
    } else {
      const deployment = await partialExtension.get(name);
      return {
        ...deployment,
        newlyDeployed: false,
      };
    }
  }

  return {extension, utils};
}

function pause(duration: number): Promise<void> {
  return new Promise((res) => setTimeout(res, duration * 1000));
}

export async function waitForTx(
  ethereum: EthereumProvider,
  txHash: string,
  isContract: boolean
): Promise<Receipt> {
  let receipt;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      receipt = await ethereum.send('eth_getTransactionReceipt', [txHash]);
    } catch (e) {}
    if (receipt && receipt.blockNumber) {
      if (isContract) {
        if (!receipt.contractAddress) {
          throw new Error('contract not deployed');
        } else {
          return receipt;
        }
      } else {
        return receipt;
      }
    }
    await pause(2);
  }
}

function replaceTemplateArgs(
  proxyArgsTemplate: string[],
  {
    implementationAddress,
    proxyAdmin,
    data,
    proxyAddress,
  }: {
    implementationAddress: string;
    proxyAdmin: string;
    data: string;
    proxyAddress?: string;
  }
): any[] {
  const proxyArgs: any[] = [];
  for (let i = 0; i < proxyArgsTemplate.length; i++) {
    const argValue = proxyArgsTemplate[i];
    if (argValue === '{implementation}') {
      proxyArgs.push(implementationAddress);
    } else if (argValue === '{admin}') {
      proxyArgs.push(proxyAdmin);
    } else if (argValue === '{data}') {
      proxyArgs.push(data);
    } else if (argValue === '{proxy}') {
      if (!proxyAddress) {
        throw new Error(`Expected proxy address but none was specified.`);
      }
      proxyArgs.push(proxyAddress);
    } else {
      proxyArgs.push(argValue);
    }
  }

  return proxyArgs;
}
