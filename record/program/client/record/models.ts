import { PublicKey } from '@solana/web3.js';

// TODO: RecordData class for reading Record Program Account Data
export class Data {
  
    /// The account allowed to update the data
    offset: number;
  
    /// The data contained by the account, could be anything serializable
    data: string;
  
    constructor(args: {
      offset: number;
      data: string;
    }) {
      this.offset = args.offset;    
      this.data = args.data;
    }
  }
  
  // TODO: RecordData class for reading Record Program Account Data
  // This class is used to deserialized, in this case fix length data
  export class RecordData {
    /// Struct version, allows for upgrades to the program
    version: number;
  
    /// The account allowed to update the data
    authority: PublicKey;
  
    /// The data contained by the account, could be anything serializable
    data: Buffer;  

    constructor(args: {
      version: number;    
      authority: PublicKey;
      data: Buffer;      
    }) {
      this.version = args.version;
      this.authority = args.authority;
      this.data = args.data;      
    }

    /// Formatted version of the data  
    get dataFormatted() {
        return Buffer.from(this.data).toString();
    }
  }