import {TronSigner} from './signer';
import {Contract, ContractFactory, ContractInterface, ethers} from 'ethers';
import {TransactionRequest} from '@ethersproject/providers';
import {CreateSmartContract, MethodSymbol, TronTxMethods} from './types';
import {strip0x} from './utils';
export {Contract} from 'ethers';

/**
 * A contract factory for deploying and interacting with smart contracts on the TRON network.
 *
 * `TronContractFactory` extends `ContractFactory` from ethers.js to provide functionalities
 * specific to the TRON network. It is used for deploying smart contracts and creating contract instances
 * with a given ABI and bytecode, signed by a `TronSigner`.
 *
 * @extends ContractFactory
 *
 * @constructor
 * @param {ContractInterface} abi - The contract's ABI.
 * @param {ethers.BytesLike} bytecode - The contract's bytecode.
 * @param {TronSigner} signer - The `TronSigner` instance to sign transactions.
 * @param {string} [contractName=''] - An optional name for the contract, used in TRON-specific transaction fields.
 */
export class TronContractFactory extends ContractFactory {
  public default_originEnergyLimit = 1e7;
  public abi: any;

  constructor(
    abi: ContractInterface,
    bytecode: ethers.BytesLike,
    signer: TronSigner,
    public readonly contractName = ''
  ) {
    super(abi, bytecode, signer);
    this.abi = abi;
  }

  /**
   * Deploys a smart contract to the TRON network.
   *
   * This method overrides the `deploy` method from the base contract factory. However, it is not implemented
   * for the Tron contract factory and will throw an error if called. Deploying contracts on the TRON network
   * requires a different approach and should be handled using the `getDeployTransaction` method.
   *
   * @param {...any[]} args - Constructor arguments for the smart contract.
   * @returns {Promise<Contract>} A promise that resolves to the deployed contract instance.
   * @throws {Error} Throws an error indicating that the deploy method is not implemented.
   */
  override async deploy(...args: Array<any>): Promise<Contract> {
    throw new Error('deploy is not implemented on Tron contract factory');
  }

  /**
   * Constructs the deployment transaction for a smart contract on the TRON network.
   *
   * This method overrides `getDeployTransaction` from the base contract factory to construct
   * a transaction specifically tailored for deploying smart contracts on the TRON network.
   * It encodes the constructor arguments, sets the necessary TRON-specific fields in the transaction,
   * and handles the conversion of values to match TRON's requirements.
   *
   * Special Considerations:
   * - The `name` field of the transaction is derived from the contract's name and truncated to 32 characters.
   * - TRON-specific fields like `feeLimit`, `callValue`, `userFeePercentage`, and `originEnergyLimit` are set.
   * - The transaction is prepared in a format suitable for TRON, differing from standard Ethereum transactions.
   *
   * @param {...any[]} args - Constructor arguments for the smart contract.
   * @returns {ethers.providers.TransactionRequest} A TRON-specific transaction request object for contract deployment.
   */
  override getDeployTransaction(
    ...args: any[]
  ): ethers.providers.TransactionRequest {
    const {data, value} = super.getDeployTransaction(
      ...args
    ) as TransactionRequest;

    const params = this.interface.encodeDeploy(
      args.slice(0, this.interface.deploy.inputs.length)
    );

    const tx: CreateSmartContract = {
      feeLimit: undefined,
      callValue: value ? Number(value.toString()) : 0,
      userFeePercentage: 100,
      originEnergyLimit: this.default_originEnergyLimit,
      abi: this.abi,
      bytecode: strip0x(this.bytecode),
      rawParameter: strip0x(params),
      name: this.contractName.slice(0, 32), //contractName's length cannot be greater than 32
      data: data?.toString() ?? '',
      [MethodSymbol]: TronTxMethods.CREATE,
    };
    return tx;
  }
}
