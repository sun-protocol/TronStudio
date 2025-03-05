/**
 * Types and interfaces below are based on @daochild/tronweb-typescript@1.1.0
 * Original Source: https://github.com/daochild/tronweb-typescript
 */
declare module 'tronweb' {
  import {BigNumber} from 'bignumber.js';
  import {
    Account,
    AccountMnemonic,
    AssetTRC10,
    AssetUpdate,
    BlockInfo,
    BlockInput,
    BlockTransaction,
    BytesLike,
    ChainParameter,
    ContractExecutionParams,
    CreateRandomOptions,
    DelegatedResourceAccount,
    DelegatedResourceList,
    EnergyEstimate,
    EventResult,
    Exchange,
    Header,
    HexString,
    JsonFragment,
    KeyValue,
    Miner,
    NodeInfo,
    Proposal,
    RawTransactionResult,
    Resource,
    SideOptions,
    TokenInfo,
    Transaction,
    TransactionResult,
    TriggerConstantContractResult,
    TronAccountResource,
    TronContract,
    TronContractResult,
    TronWebConstructor,
    TronWebError1,
    TronWebError2,
    TrxAccount,
  } from 'tronweb/interfaces';

  export class TronWeb {
    address: address;
    transactionBuilder: transactionBuilder;
    trx: trx;
    utils: utils;
    constructor(
      fullNode: string,
      solidityNode: string,
      eventServer: string | boolean,
      privateKey?: string | boolean
    );
    constructor(
      fullNode: string,
      solidityNode: string,
      eventServer: string | boolean,
      sideOptions: SideOptions,
      privateKey?: string | boolean
    );
    constructor(obj: TronWebConstructor);
    contract(data: JsonFragment[], address: string): TronContract;
    setHeader(header: Header): void | Error;
    currentProvider(): any;
    currentProviders(): any;
    getEventByTransactionID(transactionID: string): Promise<Transaction | any>;
    getEventResult(
      contractAddress: string,
      options?: Record<string, unknown>
    ): Promise<EventResult[] | any>; // check this return
    isConnected(): Record<string, unknown>;
    isValidProvider(provider: any): any;
    setAddress(address: string): void | Error;
    setDefaultBlock(blockID?: BlockInput): void | string | boolean;
    setEventServer(eventServer: any): void | Error;
    setFullNode(fullNode: any): void | Error;
    setPrivateKey(privateKey: string): void | Error;
    setSolidityNode(solidityNode: any): void | Error;
    createAccount(): Promise<Account | any>;
    createRandom(options?: CreateRandomOptions): Promise<AccountMnemonic | any>;
    fromAscii(string: any, padding: any): any;
    fromDecimal(value: number | string): string;
    fromSun(sun: string | number): string;
    fromUtf8(string: string): string;
    fromMnemonic(
      mnemonic: string,
      path?: string,
      wordlist?: string
    ): AccountMnemonic | Error;
    isAddress(address: string): boolean;
    sha3(string: string, prefix?: boolean): HexString;
    toAscii(hex: HexString): string;
    toBigNumber(
      amount: number | string | HexString
    ): BigNumber | Record<string, unknown>;
    toDecimal(value: string | HexString): number | string;
    toHex(
      val: string | number | Record<string, unknown> | [] | BigNumber
    ): HexString;
    toSun(trx: number): string;
    toUtf8(hex: string): string;
    BigNumber(val: number | string | HexString): BigNumber;
    feeLimit: number;
    defaultAddress: {
      hex: boolean | string;
      base58: boolean | string;
    };
    fullNode: any;
  }
  // export interface TronWeb {
  // }

  export class transactionBuilder {
    addUpdateData(
      unsignedTransaction: JSON | Record<string, unknown>,
      memo: string
    ): Promise<Transaction | Record<string, unknown>>;
    applyForSR(
      address: string,
      url: string,
      options?: number
    ): Promise<Transaction | Record<string, unknown>>;
    createAccount(
      address: string,
      options?: JSON | Record<string, unknown>
    ): Promise<Transaction | Record<string, unknown>>;
    createAsset(
      options: AssetTRC10,
      issuerAddress: string
    ): Promise<Transaction | Record<string, unknown>>;
    createProposal(
      parameters: KeyValue[],
      issuerAddress: string,
      options?: number
    ): Promise<Transaction | Record<string, unknown>>;
    createSmartContract(
      options: ContractExecutionParams,
      issuerAddress: string
    ): Promise<Record<string, any>>;
    createToken(
      options: AssetTRC10,
      issuerAddress: string
    ): Promise<Transaction | Record<string, unknown>>;
    delegateResource(
      amount: number,
      receiverAddress: string,
      resource: string,
      address: string,
      lock: boolean,
      options?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    deleteProposal(
      proposalID: number,
      issuerAddress: string,
      options?: number
    ): Promise<Transaction | Record<string, unknown>>;
    estimateEnergy(
      contractAddress: string | HexString,
      functionSelector: string,
      options: Record<string, unknown>,
      parameter: any[],
      issuerAddress: string | HexString
    ): Promise<EnergyEstimate>;
    extendExpiration(
      transaction: Transaction | JSON | Record<string, unknown>,
      extension: number
    ): Promise<Transaction>;
    freezeBalance(
      amount: number,
      duration: number,
      resource: Resource,
      ownerAddress: string,
      receiverAddress: string,
      options?: number
    ): Promise<Transaction>;
    freezeBalanceV2(
      amount: number,
      resource: Resource,
      ownerAddress: string,
      options?: Record<string, unknown>
    ): Promise<Transaction | Record<string, unknown>>;
    injectExchangeTokens(
      exchangeID: number,
      tokenID: string,
      tokenAmount: number,
      ownerAddress: string,
      options?: number
    ): Promise<Transaction>;
    purchaseAsset(
      issuerAddress: string,
      tokenID: string,
      amount: number,
      buyer?: string,
      options?: number
    ): Promise<Transaction | Record<string, unknown>>;
    purchaseToken(
      issuerAddress: string,
      tokenID: string,
      amount: number,
      buyer?: string,
      options?: number
    ): Promise<Transaction | Record<string, unknown>>;
    sendAsset(
      to: string,
      amount: number,
      tokenID: string,
      from: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    sendToken(
      to: string,
      amount: number | string,
      tokenID: string,
      pk?: string
    ): Promise<Transaction | Record<string, unknown>>;
    sendTrx(
      to: string,
      amount: number,
      from: string,
      options?: number
    ): Promise<Transaction>;
    tradeExchangeTokens(
      exchangeID: number,
      tokenID: string,
      tokenAmountSold: number,
      tokenAmountExpected: number,
      ownerAddress: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    triggerConfirmedConstantContract(
      contractAddress: string,
      functions: string,
      options: Record<string, unknown>,
      parameter: any[],
      issuerAddress: string
    ): Promise<TransactionResult | Record<string, unknown>>;
    triggerConstantContract(
      contractAddress: string,
      functions: string,
      options: Record<string, unknown>,
      parameter: any[],
      issuerAddress: string
    ): Promise<TriggerConstantContractResult | Record<string, unknown>>;
    triggerSmartContract(
      contractAddress: string,
      functions: string,
      options: Record<string, unknown>,
      parameter: any[],
      issuerAddress: string
    ): Promise<TriggerConstantContractResult>;
    undelegateResource(
      amount: number,
      receiverAddress: string,
      resource: string,
      address: string,
      options?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    unfreezeBalance(
      resource: Resource,
      address: string,
      receiver: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    unfreezeBalanceV2(
      amount: number,
      resource: Resource,
      address: string,
      options: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    updateSetting(
      contract_address: string,
      consume_user_resource_percent: number,
      owner_address: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    updateAccountPermissions(
      owner_address: string,
      ownerPermissions: Record<string, unknown>,
      witnessPermissions: Record<string, unknown> | null,
      activesPermissions: Record<string, unknown>[]
    ): Promise<Transaction | Record<string, unknown>>;
    updateAsset(
      options: AssetUpdate,
      issuerAddress: string
    ): Promise<Transaction | Record<string, unknown>>;
    updateBrokerage(
      brokerage: number,
      ownerAddress: string
    ): Promise<Transaction | Record<string, unknown>>;
    updateEnergyLimit(
      contract_address: string,
      origin_energy_limit: number,
      owner_address: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    updateToken(
      options: AssetUpdate,
      issuerAddress: string
    ): Promise<Transaction | Record<string, unknown>>;
    vote(
      votes: Record<string, unknown>,
      voterAddress: string,
      option: number
    ): Promise<Transaction | Record<string, unknown>>;
    voteProposal(
      proposalID: number,
      hasApproval: string,
      voterAddress: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    withdrawBlockRewards(
      address: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    withdrawExchangeTokens(
      exchangeID: number,
      tokenID: string,
      tokenAmount: number,
      ownerAddress: string,
      options: number
    ): Promise<Transaction | Record<string, unknown>>;
    withdrawExpireUnfreeze(address: string): Promise<Record<string, unknown>>;
  }
  export class trx {
    getAccount(address: HexString | string): Promise<TrxAccount>;
    getAccountResources(
      address: HexString | string
    ): Promise<TronAccountResource>;
    getApprovedList(r: Transaction): Promise<TransactionResult>;
    getAvailableUnfreezeCount(
      address: string | HexString,
      options?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    getBalance(address: string | HexString): Promise<number>;
    getBandwidth(address: string | HexString): Promise<Record<string, unknown>>;
    getBlock(block?: number | string): Promise<BlockInfo>;
    getBlockByHash(blockHash: string): Promise<BlockInfo>;
    getBlockByNumber(blockID: number): Promise<BlockInfo>;
    getBlockRange(start: number, end: number): Promise<BlockInfo[]>;
    getBlockTransactionCount(
      block: number | string
    ): Promise<Record<string, unknown> | number>;
    getBrokerage(address: string | HexString): Promise<number | any>;
    getCanDelegatedMaxSize(
      address: string | HexString,
      resource?: Resource,
      options?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    getCanWithdrawUnfreezeAmount(
      address: string | HexString,
      timestamp?: number,
      options?: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
    getChainParameters(): Promise<ChainParameter[]>;
    getConfirmedTransaction(
      transactionID: string
    ): Promise<Record<string, unknown>>;
    getContract(
      contractAddress: string | HexString
    ): Promise<TronContractResult | TronContract | Record<string, unknown>>;
    getCurrentBlock(): Promise<BlockInfo>;
    getDelegatedResourceV2(
      fromAddress: string | HexString,
      toAddress: string | HexString,
      options?: Record<string, unknown>
    ): Promise<DelegatedResourceList | Record<string, unknown>>;
    getDelegatedResourceAccountIndexV2(
      address: string | HexString,
      options?: Record<string, unknown>
    ): Promise<DelegatedResourceAccount | Record<string, unknown>>;
    getExchangeByID(
      exchangeID: number
    ): Promise<Exchange | Record<string, unknown>>;
    getNodeInfo(): Promise<NodeInfo | Record<string, unknown>>;
    getReward(address: string | HexString): Promise<number>;
    getSignWeight(
      tx: Transaction
    ): Promise<TransactionResult | Record<string, unknown>>;
    getTokenByID(
      tknID: string | number
    ): Promise<TokenInfo | Record<string, unknown>>;
    getTokenFromID(tokenID: string | number): Promise<TokenInfo>;
    getTokenListByName(
      name: string
    ): Promise<TokenInfo[] | Record<string, unknown>[]>;
    getTokensIssuedByAddress(
      address: string | HexString
    ): Promise<Record<string, unknown>>;
    getTransaction(
      transactionID: string
    ): Promise<BlockTransaction | TronWebError2>;
    getTransactionFromBlock(
      block: number | string,
      index: number
    ): Promise<
      | BlockTransaction[]
      | Record<string, unknown>[]
      | BlockTransaction
      | Record<string, unknown>
    >;
    getTransactionInfo(
      transactionID: string
    ): Promise<Transaction | Record<string, unknown>>;
    getUnconfirmedBalance(address: string): Promise<number>;
    getUnconfirmedBrokerage(address: string): Promise<number>;
    getUnconfirmedReward(address: string): Promise<number>;
    getUnconfirmedTransactionInfo(
      txid: string
    ): Promise<Transaction | Record<string, unknown>>;
    listExchanges(): Promise<Exchange[] | Record<string, unknown>[]>;
    listExchangesPaginated(
      limit: number,
      offset: number
    ): Promise<Exchange[] | Record<string, unknown>[]>;
    listNodes(): Promise<string[] | Record<string, unknown>>;
    listProposals(): Promise<
      Proposal[] | Record<string, unknown>[] | Record<string, unknown>
    >;
    listSuperRepresentatives(): Promise<Miner[] | Record<string, unknown>[]>;
    listTokens(
      limit?: number,
      offset?: number
    ): Promise<TokenInfo[] | Record<string, unknown>[]>;
    sendRawTransaction(
      signedTransaction: JSON | Record<string, unknown> | Transaction,
      options?: any
    ): Promise<RawTransactionResult | TronWebError1>;
    sendHexTransaction(
      signedHexTransaction: string | HexString
    ): Promise<Transaction | Record<string, unknown>>;
    sendToken(
      to: string,
      amount: number,
      tokenID: string,
      from: string,
      options: number
    ): Promise<TransactionResult | Record<string, unknown>>;
    sendTransaction(
      to: string,
      amount: number,
      pk?: string
    ): Promise<TransactionResult | Record<string, unknown>>;
    sign(
      transaction: Record<string, unknown> | Transaction,
      privateKey?: string
    ): Promise<Transaction>;
    sign(str: string, privateKey: string): Promise<string>;
    signMessageV2(msg: string | BytesLike, privateKey: string): Promise<string>;
    timeUntilNextVoteCycle(): Promise<number>;
    multiSign(
      tx: JSON | Record<string, unknown>,
      pk: string,
      permissionId: number
    ): Promise<Transaction | Record<string, unknown>>;
    verifyMessage(
      message: string | HexString,
      signature: string,
      address: string
    ): Promise<boolean>;
    verifyMessageV2(
      message: string | HexString,
      signature: string
    ): Promise<string>;
    _signTypedData(
      domain: JSON | Record<string, unknown>,
      types: JSON | Record<string, unknown>,
      value: JSON | Record<string, unknown>,
      privateKey: string
    ): Promise<string>;
    verifyTypedData(
      domain: JSON | Record<string, unknown>,
      types: JSON | Record<string, unknown>,
      value: JSON | Record<string, unknown>,
      signature: string,
      address: string
    ): Promise<boolean | Error>;
  }
  export class address {
    fromHex(hex: string): string;
    fromPrivateKey(pk: string): string;
    toHex(base58: string): string;
  }
  export class utils {
    transaction: {
      txJsonToPb(tx: JSON | Record<string, unknown>): Record<string, unknown>;
      txPbToTxID(tx: JSON | Record<string, unknown>): string;
    };
  }
  export default TronWeb;
}

declare module 'tronweb/interfaces' {
  /**
   *  A string which is prefixed with ``0x`` and followed by any number
   *  of case-agnostic hexadecimal characters.
   *
   *  It must match the regular expression ``/0x[0-9A-Fa-f]*\/``.
   */
  export type HexString = string;

  /**
   *  A [[HexString]] whose length is even, which ensures it is a valid
   *  representation of binary data.
   */
  export type DataHexString = string;

  /**
   *  An object that can be used to represent binary data.
   */
  export type BytesLike = DataHexString | Uint8Array;

  /**
   *  About frgaments...
   *
   *  @_subsection api/abi/abi-coder:Fragments  [about-fragments]
   */
  /**
   *  A type description in a JSON API.
   */
  export interface JsonFragmentType {
    /**
     *  The parameter name.
     */
    readonly name?: string;
    /**
     *  If the parameter is indexed.
     */
    readonly indexed?: boolean;
    /**
     *  The type of the parameter.
     */
    readonly type?: string;
    /**
     *  The internal Solidity type.
     */
    readonly internalType?: string;
    /**
     *  The components for a tuple.
     */
    readonly components?: ReadonlyArray<JsonFragmentType>;
  }

  /**
   *  A fragment for a method, event or error in a JSON API.
   */
  export interface JsonFragment {
    /**
     *  The name of the error, event, function, etc.
     */
    readonly name?: string;

    /**
     *  The type of the fragment (e.g. ``event``, ``"function"``, etc.)
     */
    readonly type?: string;

    /**
     *  If the event is anonymous.
     */
    readonly anonymous?: boolean;

    /**
     *  If the function is payable.
     */
    readonly payable?: boolean;

    /**
     *  If the function is constant.
     */
    readonly constant?: boolean;

    /**
     *  The mutability state of the function.
     */
    readonly stateMutability?: string;

    /**
     *  The input parameters.
     */
    readonly inputs?: ReadonlyArray<JsonFragmentType>;

    /**
     *  The output parameters.
     */
    readonly outputs?: ReadonlyArray<JsonFragmentType>;

    /**
     *  The gas limit to use when sending a transaction for this function.
     */
    readonly gas?: string;
  }

  export type Resource = 'BANDWIDTH' | 'ENERGY';

  export type BlockInput = 'latest' | 'earliest' | number;

  export interface Account {
    address: {
      base58: string;
      hex: string;
    };
    privateKey: string;
    publicKey: string;
    __proto__: Record<string, unknown>;
  }

  export interface AccountMnemonic {
    mnemonic: {
      phrase: string;
      path: string;
      locale: string;
    };
    privateKey: string;
    publicKey: string;
    address: string;
  }

  export interface CreateRandomOptions {
    path: string;
    extraEntropy: string;
    locale: string;
  }

  export interface Transaction {
    block: number;
    timestamp: number;
    contract: string;
    name: string;
    transaction: string;
    result: {
      r: string;
      afterSeed: string;
      s: string;
      index: string;
      previousSeed: string;
      updater: string;
      timestamp: string;
    };
    resourceNode: string;
  }

  export interface EventResult {
    block: number;
    timestamp: number;
    contract: string;
    name: string;
    transaction: string;
    result: {
      index: string;
      rng: string;
      timestamp: string;
    };
    resourceNode: string;
  }

  export interface TrxAccount {
    address: string;
    balance: number;
    frozen: {frozen_balance: number; expire_time: number}[];
    create_time: number;
    latest_opration_time: number;
    latest_consume_free_time: number;
    account_resource: {
      frozen_balance_for_energy: {frozen_balance: number; expire_time: number};
      latest_consume_time_for_energy: number;
    };
    owner_permission: {
      permission_name: string;
      threshold: number;
      keys: [[Record<string, unknown>] | Record<string, unknown>];
    };
    active_permission: {
      type: string;
      id: number;
      permission_name: string;
      threshold: number;
      operations: string;
      keys: [Array<any>];
    }[];
    assetV2: {key: string; value: number}[];
    free_asset_net_usageV2: {key: string; value: number}[];
  }

  export interface ParameterValueOnTriggerSC {
    data: string;
    token_id: number;
    owner_address: string;
    call_token_value: number;
    contract_address: string;
  }

  export interface RawDataContract {
    parameter: {
      value:
        | {
            amount: number;
            owner_address: string;
            to_address: string;
          }
        | ParameterValueOnTriggerSC
        | Record<string, unknown>;
      type_url: string;
    };
    type: string;
  }

  export interface Transaction {
    visible: boolean;
    signature?: string[];
    txID: string;
    raw_data: {
      contract: RawDataContract[] | Record<string, unknown>[];
      ref_block_bytes: string;
      ref_block_hash: string;
      expiration: number;
      timestamp: number;
      fee_limit?: number;
    };
    raw_data_hex: string;
  }

  export interface TransactionResult {
    result: {[key: string]: any} | boolean;
    approved_list?: string[];
    transaction:
      | {
          result: {result: boolean};
          txid: string;
          transaction: {
            signature: any[];
            txID: string;
            raw_data: Record<string, unknown>[];
            raw_data_hex: string;
          };
        }
      | Transaction;
  }

  export interface RawTransactionResult {
    result: {[key: string]: any} | boolean;
    txid: string;
    approved_list?: string[];
    transaction: {
      result: {result: boolean};
      contract_address: string;
      visible: boolean;
      signature: string[];
      txID: string;
      raw_data: Record<string, unknown>;
      raw_data_hex: string;
    };
  }

  export interface TronAccountResource {
    freeNetLimit: number;
    netLimit: number;
    assetNetUsed: {key: string; value: number}[];
    assetNetLimit: {key: string; value: number}[];
    totalNetLimit: number;
    totalNetWeight: number;
    energyLimit: number;
    totalEnergyLimit: number;
    totalEnergyWeight: number;
  }

  export interface BlockTransaction {
    ret: Array<{contractRet: string}>;
    signature: string[];
    txID: string;
    contract_address: string;
    raw_data: {
      contract: Array<{
        parameter: {
          value: {
            owner_address: string;
            new_contract: {
              bytecode: string;
              consume_user_resource_percent: number;
              name: string;
              origin_address: string;
              abi: Record<string, any>;
              origin_energy_limit: number;
            };
          };
          type_url: string;
        };
        type: string;
      }>;
      ref_block_bytes: string;
      ref_block_hash: string;
      expiration: number;
      fee_limit: number;
      timestamp: number;
    };
    raw_data_hex: string;
  }

  export interface BlockInfo {
    blockID: string;
    block_header: {
      raw_data: {
        number?: number;
        txTrieRoot: string;
        witness_address: string;
        parentHash: string;
        timestamp?: number;
        version?: number;
      };
      witness_signature: string;
    };
    transactions?: BlockTransaction[];
  }

  export interface KeyValue {
    key: string;
    value?: number;
  }

  export type ChainParameter = KeyValue;

  export interface DelegatedResource {
    from: string;
    to: string;
    frozen_balance_for_bandwidth: number;
  }

  export interface DelegatedResourceList {
    delegatedResource: DelegatedResource[];
  }

  export interface DelegatedResourceAccount {
    account: string | HexString;
    toAccounts: string[] | HexString[];
  }

  export interface Exchange {
    exchange_id: number;
    creator_address: string | HexString;
    create_time: number;
    first_token_id: string;
    first_token_balance: number;
    second_token_id: string;
    second_token_balance: number;
  }

  export interface ConfigNodeInfo {
    activeNodeSize: number;
    allowAdaptiveEnergy: number;
    allowCreationOfContracts: number;
    backupListenPort: number;
    backupMemberSize: number;
    backupPriority: number;
    codeVersion: string;
    dbVersion: number;
    discoverEnable: boolean;
    listenPort: number;
    maxConnectCount: number;
    maxTimeRatio: number;
    minParticipationRate: number;
    minTimeRatio: number;
    p2pVersion: string;
    passiveNodeSize: number;
    sameIpMaxConnectCount: number;
    sendNodeSize: number;
    supportConstant: boolean;
    versionName: string;
    versionNum: string;
  }

  export interface MachineInfo {
    cpuCount: number;
    cpuRate: number;
    deadLockThreadCount: number;
    deadLockThreadInfoList: any[]; // this can be improved by defining a specific type
    freeMemory: number;
    javaVersion: string;
    jvmFreeMemory: number;
    jvmTotalMemoery: number;
    memoryDescInfoList: any[]; // this can be improved by defining a specific type
    osName: string;
    processCpuRate: number;
    threadCount: number;
    totalMemory: number;
  }

  export interface PeerInfo {
    active: boolean;
    avgLatency: number;
    blockInPorcSize: number;
    connectTime: number;
    disconnectTimes: number;
    headBlockTimeWeBothHave: number;
    headBlockWeBothHave: string;
    host: string;
    inFlow: number;
    lastBlockUpdateTime: number;
    lastSyncBlock: string;
    localDisconnectReason: string;
    needSyncFromPeer: boolean;
    needSyncFromUs: boolean;
    nodeCount: number;
    nodeId: string;
    port: number;
    remainNum: number;
    remoteDisconnectReason: string;
    score: number;
    syncBlockRequestedSize: number;
    syncFlag: boolean;
    syncToFetchSize: number;
    syncToFetchSizePeekNum: number;
    unFetchSynNum: number;
  }

  export interface NodeInfo {
    activeConnectCount: number;
    beginSyncNum: number;
    block: string;
    cheatWitnessInfoMap: any; // this can be improved by defining a specific type
    configNodeInfo: ConfigNodeInfo;
    currentConnectCount: number;
    machineInfo: MachineInfo;
    passiveConnectCount: number;
    peerList: PeerInfo[];
    solidityBlock: string;
    totalFlow: number;
  }

  export interface TokenInfo {
    owner_address: string;
    name: string;
    abbr: string;
    total_supply: number;
    trx_num: number;
    precision: number;
    num: number;
    start_time: number;
    end_time: number;
    description: string;
    url: string;
    id: string;
  }

  export interface Transaction {
    id: string;
    fee: number;
    blockNumber: number;
    blockTimeStamp: number;
    contractResult: string[];
    contract_address: string;
    receipt: {
      origin_energy_usage: number;
      energy_usage_total: number;
      net_fee: number;
      result: string;
    };
    log: {
      address: string;
      topics: string[];
      data: string;
    }[];
    internal_transactions?: {
      hash: string;
      caller_address: string;
      transferTo_address: string;
      callValueInfo: string[];
      note: string;
    }[];
  }

  export interface Proposal {
    proposal_id: number;
    proposer_address: string;
    parameters: {[key: string]: any}[]; // Assuming the parameters can be of any type
    expiration_time: number;
    create_time: number;
    approvals: string[];
    state: 'APPROVED' | 'DISAPPROVED' | 'IN_VOTING';
  }

  export interface Miner {
    address: string;
    voteCount: number;
    url: string;
    totalProduced: number;
    totalMissed: number;
    latestBlockNum: number;
    latestSlotNum: number;
    isJobs: boolean;
  }

  export interface AssetTRC10 {
    name: string;
    abbreviation: string;
    description: string;
    url: string;
    totalSupply: number;
    trxRatio: number;
    tokenRatio: number;
    saleStart: number;
    saleEnd: number;
    freeBandwidth: number;
    freeBandwidthLimit: number;
    frozenAmount: number;
    frozenDuration: number;
    precision: number;
    permission_id?: number;
  }

  export interface ContractExecutionParams {
    feeLimit?: number;
    callValue?: number;
    tokenId?: string;
    tokenValue?: number;
    userFeePercentage?: number;
    originEnergyLimit?: number;
    // contrary to Tron docs abi doesn't just accept strings
    abi: string | JsonFragment[] | Record<string, any>[];
    bytecode: string;
    parameters?: string[];
    rawParameter?: string;
    name: string;
    permissionId?: number;
  }

  export interface EnergyEstimate {
    result: Record<string, unknown>;
    energy_required: number;
  }

  export interface TriggerConstantContractResult {
    result: {
      result: boolean;
    };
    energy_used: number;
    constant_result: string[];
    logs: {
      address: string;
      data: string;
      topics: string[];
    }[];
    transaction: {
      ret: Record<string, unknown>[];
      visible: boolean;
      txID: string;
      raw_data: {
        contract: {
          parameter: {
            value: {
              data: string;
              owner_address: string;
              contract_address: string;
            };
            type_url: string;
          };
          type: string;
        }[];
        ref_block_bytes: string;
        ref_block_hash: string;
        expiration: number;
        timestamp: number;
      };
      raw_data_hex: string;
    };
  }

  export interface Header {
    [key: string]: string;
  }

  export interface TronWebConstructor {
    fullHost: string;
    headers?: Header;
    privateKey?: string;
  }

  export interface SideOptions {
    fullNode: string;
    solidityNode: string;
    eventServer: string;
    mainGatewayAddress: string;
    sideGatewayAddress: string;
    sideChainId: string;
  }

  export interface AssetUpdate {
    description?: string;
    url?: string;
    freeBandwidth: number;
    freeBandwidthLimit: number;
    permissionId?: number;
  }

  export interface TronContract {
    tronWeb: Record<string, unknown>;
    injectPromise: (...args: any[]) => any;
    address: string;
    abi: JsonFragment[] | [];
    eventListener: boolean;
    bytecode: boolean | string;
    deployed: boolean | string;
    lastBlock: boolean | string | number;
    methods: Record<string, unknown>;
    methodInstances: Record<string, unknown>;
    props: [];
  }

  export interface TronContractResult {
    contract_address: string;
    origin_address: string;
    abi: JsonFragment[] | [] | Record<string, unknown>;
    bytecode: boolean | string;
    name: string;
  }

  export interface TronWebError1 {
    code: string;
    message: string;
    txid: string;
  }

  export interface TronWebError2 {
    Error: string;
  }
  export type TronWebErrorResponse = TronWebError1 | TronWebError2;
}
