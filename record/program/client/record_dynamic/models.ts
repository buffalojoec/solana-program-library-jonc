import { PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js';  
import { deserializeUnchecked, serialize, Schema } from 'borsh';
import '../utils/borsh_ext'

// Account header size.
export const HEADER_LENGTH = 33;

// TODO: DynamicRecordTest
export class SimpleRecord {
    key: Uint8Array;
    message: string;
  
    static schema: Schema = new Map([
      [
        SimpleRecord,
        {
          kind: 'struct',
          fields: [
            ['key', [32]],
            ['message', 'string'],
          ],
        },
      ],
    ]);
    constructor(obj: { key: Uint8Array; message: string }) {
      this.key = obj.key;
      this.message = obj.message;
    }
  
    public static async getAccountData(    
      accountPublicKey: PublicKey,
      connection: Connection,
    ): Promise<SimpleRecord> {
      let recordAccount = await connection.getAccountInfo(
        accountPublicKey,
        'confirmed'
      );
      if (!recordAccount) {
        throw new Error('Account not found');
      }
  
      let res: SimpleRecord = deserializeUnchecked(
        this.schema,
        SimpleRecord,
        recordAccount.data.slice(HEADER_LENGTH)  // TODO: replace with record header len const
      );
  
      return res;
    }
  }

// TODO: RecordDynamicTestMeta
export class MetaData {
  parentKey: Uint8Array;
  name: string;
  description: string;
  uri: string;
  isMutable: boolean;
  amount: BN;
  shares: Number;

  constructor(obj: { 
    parentKey: Uint8Array;
    name: string;
    description: string;
    uri: string;
    isMutable: boolean;
    amount: BN;
    shares: Number;
  }) {
    this.parentKey = obj.parentKey;
    this.name = obj.name;    
    this.description = obj.description;    
    this.uri = obj.uri;    
    this.isMutable = obj.isMutable;
    this.amount = obj.amount;
    this.shares = obj.shares;
  }

  static schema: Schema = new Map([
    [
      MetaData,
      {
        kind: 'struct',
        fields: [
          ['parentKey', [32]],
          ['name', 'string'],
          ['description', 'string'],
          ['uri', 'string'],
          ['isMutable', 'u8'],
          ['amount', 'u64'],
          ['shares', 'u16'],
        ],
      },
    ],
  ]);

  public static async getAccountData(
    accountPublicKey: PublicKey,
    connection: Connection,    
  ): Promise<MetaData> {
    let recordAccount = await connection.getAccountInfo(
      accountPublicKey,
      'confirmed'
    );
    if (!recordAccount) {
      throw new Error('Account not found');
    }

    const data: MetaData = deserializeUnchecked(
      this.schema,
      MetaData,
      recordAccount.data.slice(HEADER_LENGTH)
    );
    return data;
  }
}
