import { BigNumber } from 'ethers';

export interface TransactionInfo {
  target: string;
  value: BigNumber;
  data: string;
  executed: boolean;
}
