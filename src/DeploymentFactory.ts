import {
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';
import { ContractFactory, PayableOverrides, Signer, ethers } from 'ethers';
import { Artifact } from 'hardhat/types';
import * as zk from 'zksync-ethers';
import { Address, Deployment, DeployOptions, ExtendedArtifact } from '../types';
import { getAddress } from '@ethersproject/address';
import { keccak256 as solidityKeccak256 } from '@ethersproject/solidity';
import { hexConcat } from '@ethersproject/bytes';
import { TronContractFactory } from './tron/contract';
import { TronSigner } from './tron/signer';
import { CreateSmartContract } from './tron/types';

export class DeploymentFactory {
  private factory: ContractFactory;
  private artifact: Artifact | ExtendedArtifact;
  private isZkSync: boolean;
  private isTron: boolean;
  private getArtifact: (name: string) => Promise<Artifact>;
  private overrides: PayableOverrides;
  private args: any[];
  constructor(
    getArtifact: (name: string) => Promise<Artifact>,
    artifact: Artifact | ExtendedArtifact,
    args: any[],
    network: any,
    ethersSigner?: Signer | zk.Signer | TronSigner,
    overrides: PayableOverrides = {}
  ) {
    this.overrides = overrides;
    this.getArtifact = getArtifact;
    this.isZkSync = network.zksync;
    this.isTron = network.tron;
    this.artifact = artifact;
    if (this.isZkSync) {
      this.factory = new zk.ContractFactory(
        artifact.abi,
        artifact.bytecode,
        ethersSigner as zk.Signer
      );
    } else if (this.isTron) {
      let contractName = '';
      if ('contractName' in artifact) ({contractName} = artifact);
      this.factory = new TronContractFactory(
        artifact.abi,
        artifact.bytecode,
        ethersSigner as TronSigner,
        contractName
      );
    } else {
      this.factory = new ContractFactory(
        artifact.abi,
        artifact.bytecode,
        ethersSigner
      );
    }
    const numArguments = this.factory.interface.deploy.inputs.length;
    if (args.length !== numArguments) {
      throw new Error(
        `expected ${numArguments} constructor arguments, got ${args.length}`
      );
    }
    this.args = args;
  }

  public async extractFactoryDeps(artifact: any): Promise<string[]> {
    const visited = new Set<string>();
    visited.add(`${artifact.sourceName}:${artifact.contractName}`);
    return await this._extractFactoryDepsRecursive(artifact, visited);
  }

  private async _extractFactoryDepsRecursive(
    artifact: any,
    visited: Set<string>
  ): Promise<string[]> {
    // Load all the dependency bytecodes.
    // We transform it into an array of bytecodes.
    const factoryDeps: string[] = [];
    for (const dependencyHash in artifact.factoryDeps) {
      if (!dependencyHash) continue;
      const dependencyContract = artifact.factoryDeps[dependencyHash];
      if (!visited.has(dependencyContract)) {
        const dependencyArtifact = await this.getArtifact(dependencyContract);
        factoryDeps.push(dependencyArtifact.bytecode);
        visited.add(dependencyContract);
        const transitiveDeps = await this._extractFactoryDepsRecursive(
          dependencyArtifact,
          visited
        );
        factoryDeps.push(...transitiveDeps);
      }
    }
    return factoryDeps;
  }

  public async getDeployTransaction(): Promise<TransactionRequest> {
    let overrides = this.overrides;
    if (this.isZkSync) {
      const factoryDeps = await this.extractFactoryDeps(this.artifact);
      const customData = {
        customData: {
          factoryDeps,
          feeToken: zk.utils.ETH_ADDRESS,
        },
      };
      overrides = {
        ...overrides,
        ...customData,
      };
    }

    return this.factory.getDeployTransaction(...this.args, overrides);
  }

  // TVM formula is identical than EVM except for the prefix: keccak256( 0x41 ++ address ++ salt ++ keccak256(init_code))[12:]
  // https://developers.tron.network/v4.4.0/docs/vm-vs-evm#tvm-is-basically-compatible-with-evm-with-some-differences-in-details
  private async calculateEvmCreate2Address(
    create2DeployerAddress: Address,
    salt: string,
    isTron?: boolean
  ): Promise<Address> {
    const deploymentTx = await this.getDeployTransaction();
    if (typeof deploymentTx.data !== 'string') {
      throw Error('unsigned tx data as bytes not supported');
    }
    const prefix = isTron ? '0x41' : '0xff';
    return getAddress(
      '0x' +
      solidityKeccak256(
        ['bytes'],
        [
          `${prefix}${create2DeployerAddress.slice(2)}${salt.slice(
            2
          )}${solidityKeccak256(['bytes'], [deploymentTx.data]).slice(2)}`,
        ]
      ).slice(-40)
    );
  }

  private async calculateZkCreate2Address(
    create2DeployerAddress: Address,
    salt: string
  ): Promise<Address> {
    const bytecodeHash = zk.utils.hashBytecode(this.artifact.bytecode);
    const constructor = this.factory.interface.encodeDeploy(this.args);
    return zk.utils.create2Address(
      create2DeployerAddress,
      bytecodeHash,
      salt,
      constructor
    );
  }

  public async getCreate2Address(
    create2DeployerAddress: Address,
    create2Salt: string
  ): Promise<Address> {
    if (this.isZkSync)
      return await this.calculateZkCreate2Address(
        create2DeployerAddress,
        create2Salt
      );
    return await this.calculateEvmCreate2Address(
      create2DeployerAddress,
      create2Salt,
      this.isTron
    );
  }

  public async compareDeploymentTransaction(
    transaction: TransactionResponse,
    deployment: Deployment
  ): Promise<boolean> {
    const newTransaction = await this.getDeployTransaction();
    const newData = newTransaction.data?.toString();
    if (this.isZkSync) {
      const currentFlattened = hexConcat(deployment.factoryDeps || []);
      const newFlattened = hexConcat(newTransaction.customData?.factoryDeps);

      return transaction.data !== newData || currentFlattened != newFlattened;
    } else if (this.isTron) {
     const tronDeployTx = newTransaction as CreateSmartContract;
      const res = await (
        this.factory.signer as TronSigner
      ).getTronWebTransaction(transaction.hash);
      const contract = res.raw_data.contract[0];
      const deployed_bytecode = contract.parameter.value.new_contract?.bytecode;
      const newBytecode = tronDeployTx.bytecode + tronDeployTx.rawParameter;
      return deployed_bytecode !== newBytecode;
    } else {
      return transaction.data !== newData;
    }
  }

  getDeployedAddress(
    receipt: TransactionReceipt,
    options: DeployOptions,
    create2Address: string | undefined
  ): string {
    if (options.deterministicDeployment && create2Address) {
      return create2Address;
    }

    if (this.isZkSync) {
      const deployedAddresses = zk.utils
        .getDeployedContracts(receipt)
        .map((info) => info.deployedAddress);

      return deployedAddresses[deployedAddresses.length - 1];
    }

    return receipt.contractAddress;
  }
}
