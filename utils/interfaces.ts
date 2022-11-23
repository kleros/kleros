import { BigNumber, BigNumberish } from 'ethers';
import { PromiseOrValue } from 'typechain-types/common';

export interface TransactionInfo {
  target: string;
  value: BigNumber;
  data: string;
  executed: boolean;
}

export interface SubcourtInfo {
  ID: PromiseOrValue<BigNumberish>;
  parent: PromiseOrValue<BigNumberish>;
  hiddenVotes: boolean | Promise<boolean>;
  minStake: PromiseOrValue<BigNumberish>;
  alpha: PromiseOrValue<BigNumberish>;
  feeForJuror: PromiseOrValue<BigNumberish>;
  jurorsForCourtJump: PromiseOrValue<BigNumberish>;
  timesPerPeriod: [
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>
  ];
  sortitionSumTreeK: PromiseOrValue<BigNumberish>;
}

export interface FixedLengthArray<T, L extends number> extends ArrayLike<T> {
  length: L;
}
