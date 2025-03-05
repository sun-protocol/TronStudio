import {ContractExecutionParams} from 'tronweb/interfaces';

export const MethodSymbol = Symbol('method');

export interface CreateSmartContract extends ContractExecutionParams {
  data: string;
  [MethodSymbol]: TronTxMethods.CREATE;
}

export enum TronTxMethods {
  CREATE = 'create',
}
