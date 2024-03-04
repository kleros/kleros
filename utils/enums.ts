export enum Phase {
  staking,
  generating,
  drawing,
}

export enum Period {
  evidence,
  commit,
  vote,
  appeal,
  execution,
}

export enum Status {
  waiting,
  appeable,
  solved,
}

export enum GovernorStatus {
  NoDispute,
  DisputeCreated,
  Resolved,
}
