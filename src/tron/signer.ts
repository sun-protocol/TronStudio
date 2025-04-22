/** Tron Lingo
 *  gasLimit in EVM == energyConsumption in TVM
 *  gasPrice in EVM == energyPrice in TVM
 */

import {BigNumber, Wallet} from 'ethers';
import {Deferrable} from 'ethers/lib/utils';
import TronWeb from 'tronweb';
import {TronWeb3Provider} from './provider';
import {Time, TronWebGetTransactionError, strip0x} from './utils';
import {CreateSmartContract, MethodSymbol, TronTxMethods} from './types';
import {
  BlockTransaction,
  ContractExecutionParams,
  Transaction,
} from 'tronweb/interfaces';
import {
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';

/**
 * Represents a signer for TRON blockchain transactions.
 *
 * `TronSigner` extends the `Wallet` class and integrates with TronWeb to handle TRON-specific
 * transaction signing and interaction. It includes functionality for managing gas prices,
 * energy factors, and other TRON-specific transaction parameters.
 *
 * Properties:
 * - `tronweb`: Instance of TronWeb for interacting with the TRON network.
 * - `gasPrice`: Object to store gas price data with a timestamp.
 * - `energyFactors`: Map to store and manage energy factors for different contracts.
 * - `MAX_ENERGY_FACTOR`: Maximum energy factor, used in calculating transaction fees.
 * - `MAX_ENERGY_DIVISOR`: A workaround divisor for handling BigNumber calculations.
 *
 * @extends Wallet
 *
 * @constructor
 * @param {string} fullHost - The full host URL for the TRON network.
 * @param {Record<string, string>} headers - Headers for network requests.
 * @param {string} privateKey - The private key for the signer.
 * @param {TronWeb3Provider} provider - The provider for the TRON network.
 */
export class TronSigner extends Wallet {
  protected tronweb: TronWeb;
  public gasPrice: {time: number; value?: BigNumber} = {time: Time.NOW};
  public energyFactors = new Map<string, {time: number; value: number}>();
  public MAX_ENERGY_FACTOR = 1.2;
  public MAX_ENERGY_DIVISOR = 1000;

  constructor(
    fullHost: string,
    headers: Record<string, string>,
    privateKey: string,
    provider: TronWeb3Provider
  ) {
    super(privateKey, provider);
    this.tronweb = new TronWeb({
      fullHost,
      headers,
      privateKey: strip0x(privateKey),
    });
  }

  /**
   * Signs a transaction using a private key.
   *
   * This function signs a given transaction using the provided private key.
   * If no private key is specified, it uses the default private key
   * with which the TronSigner was instantiated.
   *
   * @param {Record<string, unknown> | Transaction} unsignedTx - The transaction object to be signed.
   * @param {string} [privateKey] - The private key to sign the transaction with. If not provided, the default private key of the TronSigner instance is used.
   * @returns {Promise<Transaction>} A promise that resolves to the signed transaction.
   */
  async sign(
    unsignedTx: Record<string, unknown> | Transaction,
    privateKey?: string
  ): Promise<Transaction> {
    return this.tronweb.trx.sign(unsignedTx, privateKey);
  }

  /**
   * Sends a transaction to the TRON network, handling specific transaction types.
   *
   * This function overrides the base `sendTransaction` method from ethers.js wallet.
   * It checks if the transaction is a TRON-specific transaction (identified by the 'method' property).
   * If it is a standard Ethereum transaction, it calls the superclass implementation. For TRON-specific
   * transactions, it handles them based on the specified method (e.g., contract creation).
   *
   * @param {CreateSmartContract | Deferrable<TransactionRequest>} transaction - The transaction object, which can be a TRON smart contract creation or a standard Ethereum transaction.
   * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
   * @throws {Error} Throws an error if the transaction method is not implemented.
   */
  override async sendTransaction(
    transaction: CreateSmartContract | Deferrable<TransactionRequest>
  ): Promise<TransactionResponse> {
    if (!(MethodSymbol in transaction)) {
      return super.sendTransaction(transaction);
    }
    switch ((transaction as CreateSmartContract)[MethodSymbol]) {
      case TronTxMethods.CREATE:
        return this.create(transaction as CreateSmartContract);
      default:
        throw new Error('sendTransaction method not implemented');
    }
  }

  /**
   * Create a smart contract on the TRON network.
   *
   * This function handles the creation, signing, and submission of a smart contract.
   * It first constructs an unsigned transaction, then signs it and sends it to the network.
   * After sending the transaction, it waits briefly for the JSON-RPC node to become aware of it.
   * If the transaction fails at any point, a `TronWebError` is thrown.
   *
   * @param {CreateSmartContract} transaction - The smart contract transaction object.
   * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
   * @throws {TronWebError} Throws an error if the transaction submission fails.
   */
  async create(
    transaction: ContractExecutionParams & Partial<CreateSmartContract>
  ): Promise<TransactionResponse> {
    delete transaction[MethodSymbol];
    delete transaction.data;

    const unsignedTx =
      await this.tronweb.transactionBuilder.createSmartContract(
        transaction,
        this.tronweb.address.toHex(this.address)
      );

    const signedTx = await this.sign(unsignedTx);
    return (this.provider as TronWeb3Provider).sendRawTransaction(signedTx);
  }

  /**
   * Calculates the FeeLimit for a TRON contract transaction.
   *
   * The FeeLimit is computed based on the estimated basic energy consumption,
   * the energy factor (or max energy factor) of the contract, and the current energy price.
   * In any case the feeLimit is capped at the value of MAX_FEE_LIMIT
   *
   * Calculation Formulas:
   * - Tight FeeLimit = Basic Energy Consumption * (1 + Energy Factor) * Energy Price
   * - Loose FeeLimit = Basic Energy Consumption * (1 + Max Energy Factor) * Energy Price
   *
   * References:
   * - [Determining the FeeLimit](https://developers.tron.network/docs/set-feelimit#how-to-determine-the-feelimit-parameter)
   * - [Contract Energy Factor](https://developers.tron.network/reference/getcontractinfo)
   * - [Dynamic Energy Model](https://developers.tron.network/docs/resource-model#dynamic-energy-model)
   *
   * @param {Record<string, any>} unsignedTx - The unsigned transaction object.
   * @param {Record<string, any>} [overrides] - Optional overrides, such as gasLimit.
   * @returns {Promise<number>} The calculated FeeLimit as a number.
   */
  async getFeeLimit(
    unsignedTx: Record<string, any>,
    overrides?: Record<string, any>
  ): Promise<number> {
    const contract_address = unsignedTx.to ?? '';
    const data = unsignedTx.data;
    const factor = 1 + (await this.getEnergyFactor(contract_address));
    const factor_adj = BigNumber.from(
      Math.floor(factor * this.MAX_ENERGY_DIVISOR)
    );
    let energy_consumption: BigNumber;
    if (overrides?.gasLimit) {
      energy_consumption = BigNumber.from(overrides?.gasLimit.toString());
    } else {
      energy_consumption = await this.getEnergyConsumption(
        contract_address,
        data
      );
    }
    const enegyPrice = await this.getEnergyPrice();
    const feeLimit = energy_consumption
      .mul(enegyPrice)
      .mul(factor_adj)
      .div(this.MAX_ENERGY_DIVISOR);
    const maxFeeLimit = await (
      this.provider as TronWeb3Provider
    ).getMaxFeeLimit();
    if (feeLimit.gt(BigNumber.from(maxFeeLimit))) {
      return maxFeeLimit;
    }
    return feeLimit.toNumber();
  }

  /**
   * Retrieves the current energy price from the network.
   *
   * This function is an alias for `getGasPrice` and returns the current gas price
   * from the blockchain network, expressed as a BigNumber. This is useful for
   * estimating transaction costs in terms of energy.
   *
   * @returns {Promise<BigNumber>} A promise that resolves to the current energy price as a BigNumber.
   */
  getEnergyPrice = (): Promise<BigNumber> => this.getGasPrice();

  /**
   * Retrieves the current gas price from the network provider.
   *
   * This function fetches the current gas price from the blockchain network provider.
   *
   * @returns {Promise<BigNumber>} A promise that resolves to the current gas price as a BigNumber.
   */
  override async getGasPrice(): Promise<BigNumber> {
    return this.provider.getGasPrice();
  }

  /**
   * Estimates the energy consumption for executing a transaction on a given contract.
   *
   * This function estimates the gas (energy) required for a transaction with specified data
   * on a given contract address in the TRON network. It uses the `estimateGas` method
   * to calculate this. The contract address provided should have the "41" prefix that Tron appends to addresses stripped,
   *
   * @param {string} contract_address - The address of the contract on which the transaction will be executed.
   * @param {string} data - The data (payload) of the transaction.
   * @returns {Promise<BigNumber>} A promise that resolves to the estimated gas (energy) consumption as a BigNumber.
   */
  async getEnergyConsumption(
    contract_address: string,
    data: string
  ): Promise<BigNumber> {
    const gasLimit = await this.estimateGas({
      to: contract_address,
      data,
    });
    return gasLimit;
  }

  /**
   * Retrieves the energy factor for a specified contract address from the TRON network.
   *
   * This function fetches the energy factor, caching it with a 10-minute TTL to optimize performance.
   * The energy factor is updated by Tron every 6 hours. If the contract does not exist (e.g., for a create transaction),
   * the maximum energy factor is returned. The function ensures that the retrieved energy factor is a sensible value.
   *
   * @param {string} contract_address - The address of the contract for which to retrieve the energy factor.
   * @returns {Promise<number>} A promise that resolves to the energy factor of the contract.
   */
  async getEnergyFactor(contract_address: string): Promise<number> {
    const cached = this.energyFactors.get(contract_address);
    if (cached && cached.time > Time.NOW - 10 * Time.MINUTE) {
      return cached.value;
    }
    let energy_factor = this.MAX_ENERGY_FACTOR;
    if (contract_address == '') return energy_factor;
    const res = await this.tronweb.fullNode.request(
      'wallet/getcontractinfo',
      {value: contract_address, visible: false},
      'post'
    );

    // check it's a sensible value
    if (res?.contract_state?.energy_factor < this.MAX_ENERGY_FACTOR) {
      energy_factor = Number(res?.contract_state?.energy_factor);
    }
    this.energyFactors.set(contract_address, {
      time: Time.NOW,
      value: energy_factor,
    });
    return energy_factor;
  }

  /**
   * Retrieves transaction details from the TRON network for a given transaction hash.
   *
   * This function uses TronWeb to fetch the transaction details. It handles the
   * inconsistency in error reporting by TronWeb by explicitly checking for an 'Error'
   * key in the response. If an error is detected, a `TronWebGetTransactionError` is thrown.
   *
   * @param {string} hash - The hash of the transaction to be retrieved.
   * @returns {Promise<BlockTransaction>} A promise that resolves to the transaction details.
   * @throws {TronWebGetTransactionError} Throws this error if TronWeb reports an error in the transaction fetch.
   */
  async getTronWebTransaction(hash: string): Promise<BlockTransaction> {
    const res = await this.tronweb.trx.getTransaction(hash);
    if ('Error' in res) throw new TronWebGetTransactionError(res);
    return res;
  }
  
  getTronWeb() {
    return this.tronweb;
  }
}
