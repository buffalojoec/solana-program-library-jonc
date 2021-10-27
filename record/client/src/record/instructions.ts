import BN from 'bn.js';

// take it or leave it, but you could move all of the instruction creators from
// record.ts to here
export enum RecordInstruction {
    Initialize,
    Write,
    SetAuthority,
    CloseAccount,
    InitializeDynamic,
    WriteDynamic,
  }

export class InitializeArgs {
    instruction: RecordInstruction = RecordInstruction.Initialize;
}

export class WriteArgs {
    instruction: RecordInstruction = RecordInstruction.Write;
    offset: BN;
    data_len: number;
    data: String;

    constructor(args: { offset: BN, data_len: number, data: String; }) {
        this.offset = args.offset;
        this.data_len = args.data_len;
        this.data = args.data;
    }
}

export class SetAuthorityArgs {
    instruction: RecordInstruction = RecordInstruction.SetAuthority;
}

export class CloseAccountArgs {
    instruction: RecordInstruction = RecordInstruction.CloseAccount;
}
