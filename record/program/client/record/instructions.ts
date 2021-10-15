import BN from 'bn.js';

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

/// ----------------------------------------------------------------
/// TODO: DYNAMIC RECORD ACCOUNT IMPLEMENTATION
export class InitializeDynamicArgs {
    instruction: RecordInstruction = RecordInstruction.InitializeDynamic;
}

// TODO:
export class WriteDynamicArgs {
    instruction: RecordInstruction = RecordInstruction.WriteDynamic;
    offset: BN;
    data_len: number;
    data: Buffer;  

    constructor(args: { offset: BN, data_len: number, data: Buffer; }) {  
        this.offset = args.offset;
        this.data_len = args.data_len;
        this.data = args.data;    
    }
}