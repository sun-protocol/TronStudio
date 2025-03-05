import {
  ExternalProvider,
  JsonRpcFetchFunc,
  JsonRpcSigner,
  Networkish,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
  Web3Provider,
} from '@ethersproject/providers';
import {HttpNetworkConfig} from 'hardhat/types';
import {TronSigner} from './signer';
import {BigNumber, Wallet} from 'ethers';
import {
  Time,
  TronTransactionFailedError,
  TronWebError,
  ensure0x,
  strip0x,
} from './utils';
import {
  Deferrable,
  HDNode,
  isAddress,
  parseTransaction,
} from 'ethers/lib/utils';
import TronWeb from 'tronweb';
import {Transaction, TronWebError1} from 'tronweb/interfaces';

/**
 * A provider for interacting with the TRON blockchain, extending the Web3Provider.
 *
 * `TronWeb3Provider` is designed to integrate TRON's blockchain functionalities with the Web3 interface.
 * It extends the `Web3Provider` class, adapting it to work with the TRON network.
 * This class manages a collection of `TronSigner` instances for transaction signing
 * and provides methods for interacting with the TRON blockchain, such as sending transactions,
 * estimating gas, and retrieving transaction details.
 *
 * Key Features:
 * - Signer Management: Maintains a collection of `TronSigner` instances for different addresses.
 * - Transaction Handling: Provides methods for sending transactions, estimating gas, and more.
 * - TronWeb Integration: Utilizes TronWeb for direct interactions with the TRON network.
 * - Configurable: Can be configured with custom network settings and HTTP headers.
 *
 * @extends Web3Provider
 *
 * @constructor
 * @param {ExternalProvider | JsonRpcFetchFunc} provider - The underlying JSON-RPC provider.
 * @param {HttpNetworkConfig} config - Configuration for the network, including HTTP headers and URL.
 * @param {Networkish | undefined} [network] - The network configuration.
 */
export class TronWeb3Provider extends Web3Provider {
  protected signers = new Map<string, TronSigner>();
  public ro_tronweb: TronWeb;
  public gasPrice: {time: number; value?: BigNumber} = {time: Time.NOW};
  public maxFeeLimit?: number;
  public FALLBACK_MAX_FEE_LIMIT = 15e9; // 15,000 TRX;
  private readonly fullHost: string;
  private readonly headers: Record<string, string>;

  constructor(
    provider: ExternalProvider | JsonRpcFetchFunc,
    config: HttpNetworkConfig,
    network?: Networkish | undefined
  ) {
    super(provider, network);
    const {httpHeaders: headers, url, accounts} = config;
    let fullHost = url;
    // the address of the tron node has the jsonrpc path chopped off
    fullHost = fullHost.replace(/\/jsonrpc\/?$/, '');
    this.fullHost = fullHost;
    this.headers = headers;
    this.ro_tronweb = new TronWeb({fullHost, headers});
    // instantiate Tron Signer
    if (Array.isArray(accounts)) {
      for (const pk of accounts) {
        const addr = new Wallet(pk).address;
        this.signers.set(addr, new TronSigner(fullHost, headers, pk, this));
      }
    } else if (typeof accounts !== 'string' && 'mnemonic' in accounts) {
      const hdNode = HDNode.fromMnemonic(
        accounts.mnemonic,
        accounts.passphrase
      );
      const derivedNode = hdNode.derivePath(
        `${accounts.path}/${accounts.initialIndex}`
      );
      this.signers.set(
        derivedNode.address,
        new TronSigner(fullHost, headers, derivedNode.privateKey, this)
      );
    } else {
      throw new Error(
        'unable to instantiate Tron Signer, unrecognized private key'
      );
    }
  }

  /**
   * Adds a new signer to the signer collection.
   *
   * This method creates and adds a new `TronSigner` instance to the signer collection using the provided private key.
   * If a signer already exists for the derived address, it returns the existing signer.
   * Otherwise, it creates a new `TronSigner`, adds it to the collection, and returns it.
   *
   * @param pk - The private key to create a new signer.
   * @returns The newly added or existing `TronSigner` instance.
   */
  addSigner(pk: string): TronSigner {
    const addr = new Wallet(pk).address;
    if (this.signers.has(addr)) return this.signers.get(addr)!;
    const signer = new TronSigner(this.fullHost, this.headers, pk, this);
    this.signers.set(addr, signer);
    return signer;
  }

  /**
   * Retrieves the transaction count for an account.
   *
   * This method overrides the `getTransactionCount` method. Since the Tron protocol does not support
   * the concept of nonces as in Ethereum, this method returns a dummy value.
   *
   * @returns A promise that resolves to the dummy transaction count.
   */
  override async getTransactionCount(): Promise<number> {
    console.log(
      'getTransactionCount is not available in the Tron protocol, returning dummy value 1 ...'
    );
    return 1;
  }

  /**
   * Retrieves a signer instance for a given address.
   *
   * This method overrides the `getSigner` method to return a signer instance
   * associated with the provided address. If no signer is found for the given address, it throws an error.
   *
   * @template T - The type of signer to be returned, either `TronSigner` or `JsonRpcSigner`.
   * @param address - The address to retrieve the signer for.
   * @returns The signer instance corresponding to the given address.
   * @throws Throws an error if no signer exists for the provided address.
   */
  override getSigner<T extends TronSigner | JsonRpcSigner = JsonRpcSigner>(
    address: string
  ): T {
    const signer = this.signers.get(address);
    if (!signer) {
      throw new Error(`No Tron signer exists for this address ${address}`);
    }
    return signer as T;
  }

  /**
   * Retrieves the current gas price with caching.
   *
   * This method overrides the `getGasPrice` method to include a caching mechanism with a 15-second TTL.
   * If the cached value is recent (within 15 seconds), it returns the cached value. Otherwise, it fetches
   * the current gas price from the network. If fetching fails, it defaults to a predefined energy price.
   *
   * @returns A promise that resolves to the current gas price as a BigNumber.
   */
  override async getGasPrice(): Promise<BigNumber> {
    const DEFAULT_ENERGY_PRICE = BigNumber.from('1000');
    const {time, value} = this.gasPrice;
    if (time > Time.NOW - 15 * Time.SECOND && value) return value;
    const gasPrice = (await super.getGasPrice()) ?? DEFAULT_ENERGY_PRICE;
    this.gasPrice = {time: Time.NOW, value: gasPrice};
    return gasPrice;
  }

  /**
   * Sends a signed transaction to the network.
   *
   * This method first checks if the signed transaction is a simple TRX transfer (send TRX transaction).
   * If so, it handles the transaction through the `sendTrx` method.
   *
   * @param signedTransaction - The signed transaction or a promise that resolves to it.
   * @returns A promise that resolves to the transaction response.
   */
  override async sendTransaction(
    signedTransaction: string | Promise<string>
  ): Promise<TransactionResponse> {
    signedTransaction = await signedTransaction;
    const deser = parseTransaction(signedTransaction);
    const {to, data, from, value} = deser;

    // is this a send trx transaction?
    if (this.isSendTRX(to, from, data)) {
      return this.sendTrx(from!, to!, value);
    }
    // is this a smart contract transaction?
    if (await this.isSmartContractCall(to, from, data)) {
      throw new Error(
        'direct smart contract call not yet implemented for Tron'
      );
    }

    // otherwise don't alter behavior
    return super.sendTransaction(signedTransaction);
  }

  /**
   * Sends TRX from one account to another.
   *
   * This method handles the sending of TRX tokens by creating, signing, and sending a transaction.
   * It accounts for the difference in decimal places between TRX (6 decimals) and ETH (18 decimals).
   * If the value is extremely large (more than 1000 TRX), it scales down the value to prevent errors.
   * After sending the transaction, it waits briefly for the transaction to be processed.
   *
   * @param from - The address to send TRX from.
   * @param to - The address to send TRX to.
   * @param value - The amount of TRX to send, as a BigNumber.
   * @returns A promise that resolves to the transaction response.
   * @throws Throws an error if the transaction fails.
   */
  async sendTrx(
    from: string,
    to: string,
    value: BigNumber
  ): Promise<TransactionResponse> {
    if (value.gt(10 ** 9)) value = value.div(10 ** 12);
    const unsignedTx = await this.ro_tronweb.transactionBuilder.sendTrx(
      this.ro_tronweb.address.toHex(to),
      Math.floor(value.toNumber()),
      this.ro_tronweb.address.toHex(from)
    );
    const signedTx = await this.getSigner<TronSigner>(from).sign(unsignedTx);
    return this.sendRawTransaction(signedTx);
  }

  /**
   * Triggers a function call on a specified smart contract in the Tron network.
   *
   * This method constructs a transaction to call a function of a smart contract. It requires
   * the sender's address, the contract address, the function signature, parameters for the function,
   * and an options object which may include a gas limit and an optional value to send with the transaction.
   * The fee limit for the transaction is determined using the sender's signer. The transaction
   * is then signed and sent to the Tron network.
   *
   * @param from - The address of the sender initiating the contract call.
   * @param contract - The address of the smart contract to interact with.
   * @param funcSig - The function signature to call in the smart contract.
   * @param params - An array of parameters for the function call, each with a type and value.
   * @param options - An object containing optional parameters.
   * @returns A promise that resolves to a `TransactionResponse` object representing the result of the transaction.
   */
  async triggerSmartContract(
    from: string,
    contract: string,
    funcSig: string,
    params: {type: string; value: string | number}[],
    options: {
      gasLimit?: string | number | BigNumber;
      value?: string | BigNumber;
    }
  ) {
    const feeLimit = await this.getSigner<TronSigner>(from).getFeeLimit(
      {to: contract},
      options
    );
    const {transaction} =
      await this.ro_tronweb.transactionBuilder.triggerSmartContract(
        this.ro_tronweb.address.toHex(contract),
        funcSig,
        {feeLimit, callValue: options.value?.toString() ?? 0},
        params,
        this.ro_tronweb.address.toHex(from)
      );
    const signedTx = await this.getSigner<TronSigner>(from).sign(transaction);
    return this.sendRawTransaction(signedTx);
  }

  /**
   * Sends a raw transaction to the Tron network and returns the transaction response.
   *
   * This method accepts a raw transaction object, sends it to the Tron network, and waits
   * for the transaction to be acknowledged. After the transaction is acknowledged, it retrieves
   * and returns the transaction response. If the transaction fails at any stage, the method
   * throws an error.
   *
   * @param transaction - The raw transaction object to be sent to the network.
   * @returns A promise that resolves to a `TransactionResponse` object, which includes details of the processed transaction.
   * @throws `TronWebError` - If the transaction fails to be sent or acknowledged by the network.
   *
   */
  async sendRawTransaction(
    transaction: Transaction
  ): Promise<TransactionResponse> {
    const response = await this.ro_tronweb.trx.sendRawTransaction(transaction);
    if (!('result' in response) || !response.result) {
      throw new TronWebError(response as TronWebError1);
    }
    console.log('\nTron transaction broadcast, waiting for response...');
    const txRes = await this.getTransactionWithRetry(response.txid);
    txRes.wait = this._buildWait(txRes.confirmations, response.txid);
    return txRes;
  }

  /**
   * Creates a function that waits for a specified number of confirmations of a transaction.
   *
   * This method generates a function that, when called, will continuously check for the number of confirmations
   * of a given transaction until it reaches the specified target. It checks the transaction status every second.
   * If the transaction is found to have failed (status 0), a `TronTransactionFailedError` is thrown.
   *
   * @param initialConfirmations - The initial number of confirmations at the time of this method call.
   * @param hash - The hash of the transaction to wait for.
   * @returns A function that takes `targetConfirmations` and returns a promise that resolves to the transaction receipt.
   */
  private _buildWait(initialConfirmations: number, hash: string) {
    return async (
      targetConfirmations?: number
    ): Promise<TransactionReceipt> => {
      let curr_conf = initialConfirmations;
      while (targetConfirmations && curr_conf < targetConfirmations) {
        await Time.sleep(Time.SECOND); // sleep 1 sec
        const {confirmations: latest_conf} = await this.getTransactionWithRetry(
          hash,
          3
        );
        curr_conf = latest_conf;
      }
      const receipt = await this.getTransactionReceipt(ensure0x(hash));
      const {status} = receipt;
      if (status === 0) {
        throw new TronTransactionFailedError(receipt);
      }
      return receipt;
    };
  }

  /**
   * Attempts to retrieve a transaction response from the jsonrpc node using the hash, with a retry mechanism.
   *
   * This method tries to get a transaction by its hash. If the initial attempt fails, it retries
   * the operation, up to a specified number of times. Between each retry, the method waits for
   * a period that increases linearly, with an additional random jitter to avoid simultaneous
   * retry spikes. This approach is useful for handling transient network issues, or the sync delay that can happen between
   * a Tron fullNode and its rpc node
   *
   * @param hash The hash of the transaction to retrieve.
   * @param retries The maximum number of attempts to retrieve the transaction. Defaults to 10.
   * @returns A promise that resolves to the transaction response.
   */
  public async getTransactionWithRetry(
    hash: string,
    retries = 10
  ): Promise<TransactionResponse> {
    for (let i = 1; i < retries; i++) {
      try {
        const response = await this.getTransaction(ensure0x(hash)); // can return null!
        if (response == null) throw '';
        return response;
      } catch (error) {}
      // Linear backoff with jitter
      const jitter = Math.floor(Math.random() * 300);
      await Time.sleep(Time.SECOND + jitter);
    }
    return await this.getTransaction(ensure0x(hash));
  }

  /**
   * Estimates the gas required for a transaction on the TRON network.
   *
   * This method overrides the `estimateGas` method to accommodate TRON's [specific requirements](https://developers.tron.network/reference/eth_estimategas).
   * TRON does not support EIP-1559 transactions and nonces, so related fields are removed from the transaction object.
   * It then calls the superclass's `estimateGas` method for the actual estimation.
   *
   * @param transaction - The transaction object to estimate gas for.
   * @returns A promise that resolves to the estimated gas as a BigNumber.
   */
  override async estimateGas(
    transaction: Deferrable<TransactionRequest>
  ): Promise<BigNumber> {
    const toDel = ['type', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce'];
    for (const field of toDel) {
      delete (transaction as {[key: string]: any})[field];
    }
    return super.estimateGas(transaction);
  }

  /**
   * Checks if a given transaction is a smart contract call.
   *
   * This method examines the `to`, `from`, and `data` fields of a transaction
   * to determine if it is likely a call to a smart contract. It considers a transaction
   * as a smart contract call if all fields are defined, the addresses are valid,
   * the data field has a significant length, and there is associated contract code.
   *
   * @param to - The recipient address of the transaction.
   * @param from - The sender address of the transaction.
   * @param data - The data payload of the transaction.
   * @returns A promise that resolves to `true` if the transaction is a smart contract call, otherwise `false`.
   */
  async isSmartContractCall(
    to?: string,
    from?: string,
    data?: string
  ): Promise<boolean> {
    if ([to, from, data].some((f) => f == undefined)) return false;
    if ([to, from].some((f) => isAddress(f!) == false)) return false;
    if (data!.length <= 2) return false;
    const contractCode = await this.getCode(to!);
    return contractCode != undefined && strip0x(contractCode).length > 0;
  }

  /**
   * Determines if a transaction is a TRX (transfer) operation.
   *
   * This method checks if the provided `to`, `from`, and `data` fields
   * of a transaction suggest a TRX operation. It considers a transaction as
   * a TRX operation if the `to` and `from` fields are defined and the `data` field
   * is either not present or equals '0x'.
   *
   * @param to - The recipient address of the transaction.
   * @param from - The sender address of the transaction.
   * @param data - The data payload of the transaction.
   * @returns `true` if the transaction is likely a TRX operation, otherwise `false`.
   */
  isSendTRX(to?: string, from?: string, data?: string): boolean {
    if ([to, from].some((f) => f == undefined)) return false;
    return !data || data == '0x';
  }

  /**
   * Asynchronously retrieves and caches the maximum fee limit from the chain parameters.
   * If the parameter is not found, a predefined fallback value is used.
   * The value is cached for future calls to this method.
   *
   * @returns {Promise<number>} A promise that resolves with the cached or newly retrieved maximum fee limit.
   */
  async getMaxFeeLimit(): Promise<number> {
    if (this.maxFeeLimit == undefined) {
      const params = await this.ro_tronweb.trx.getChainParameters();
      const param = params.find(({key}) => key === 'getMaxFeeLimit');
      this.maxFeeLimit = param?.value ?? this.FALLBACK_MAX_FEE_LIMIT;
    }
    return this.maxFeeLimit;
  }
}
