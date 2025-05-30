import { config } from "https://deno.land/x/dotenv@v1.0.1/mod.ts";

const env = config();

const symbolByContact: { [key: string]: string } = {
  "DEC 24 CME MCRO NSDQ": "MNQZ2024",
  "DEC 24 CME MICRO S&P": "MESZ4",
  "DEC 24 CMX 1000OZSILV": "SILZ4",
  "DEC 24 CMX EMICR GOLD": "MGZ4",
  "DEC 24 CMX GOLD": "GCZ4",
  "DEC 24 CMX MHG COPPER": "MHGZ4",
  "DEC 24 CMX SILVER": "SIZ4",
  "DEC 24 EMINI S&P 500": "ESZ4",
  "DEC 24 IMM EMINI NSDQ": "NQZ4",
  "DEC 24 NYM LT CRUDE": "CLZ4",
  "DEC 24 NYM MICR CRUDE": "MCLZ4",
  "NOV 24 NYM MICR CRUDE": "MCLX4",
  "OCT 24 CME ETHER FUT": "ERV4",
  "OCT 24 CME MBT FUTURE": "MBTV4",
  "OCT 24 CME MICRO ETH": "METV4",
};

const main = async () => {
  const fromStartOf = new Date("2024-10-01");
  const toEndOf = new Date("2024-11-01");
  console.log(
    JSON.stringify(
      await loadExecutions(
        {
          jwt: env.JWT,
          accountId: env.ACCOUNT_ID,
          fromStartOf,
          toEndOf,
        },
      ),
      null,
      2,
    ),
  );
};

const loadExecutions = async (
  config: {
    jwt: String;
    accountId: String;
    fromStartOf: Date;
    toEndOf: Date;
  },
) => {
  const response = await fetch("https://api.tradestation.com/graphql/v1/live/graphql", {
    headers: {
      authorization: `Bearer ${config.jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operationName: "FetchHistoricalFuturesTransactions",
      variables: {
        dateTo: new Date(config.toEndOf.setUTCHours(23, 59, 59, 0))
          .toISOString(),
        dateFrom: new Date(config.fromStartOf.setUTCHours(0, 0, 0, 0))
          .toISOString(),
        accountId: config.accountId,
        transactionType: "Trade",
        orderBy: "TransactionDate",
        sortOrder: "Descending",
      },
      query:
        `query FetchHistoricalFuturesTransactions($accountId: String!, $dateFrom: Date!, $dateTo: Date!, $transactionType: HistoricalFuturesTransactionType!, $orderBy: HistoricalFuturesTransactionOrderBy!, $sortOrder: HistoricalFuturesTransactionSortOrder!) {
      getHistoricalFuturesTransactions(
        accountId: $accountId
        dateFrom: $dateFrom
        dateTo: $dateTo
        transactionType: $transactionType
        orderBy: $orderBy
        sortOrder: $sortOrder
      ) {
        Transactions {
          Details {
            Transactions {
              AccountId
              Contract
              TradeDate
              Buy
              Sell
              Price
              Currency
              ExchangeClearingFees
              NfaFee
              CommissionUSD
            }
          }
        }
      }
    }`,
    }),
    method: "POST",
  });

  const json = await response.json();

  if (!json.data || !json.data.getHistoricalFuturesTransactions) {
    throw new Error("Invalid response from API:\n" + JSON.stringify(json, null, 2));
  }

  const rawExecutions = json.data.getHistoricalFuturesTransactions.Transactions.flatMap((transaction: any) => transaction.Details.Transactions)
  return parseExecutions(rawExecutions)
};

type Execution = {
  accountId: string;
  contract: string;
  tradeDate: Date;
  buy: number;
  sell: number;
  price: number;
  currency: string;
  exchangeClearingFees: number;
  nfaFee: number;
  commissionUSD: number;
}

const parseExecutions = (transactions: any[]): Execution[] => transactions.map((t) => ({
  accountId: t.AccountId,
  contract: symbolByContact[t.Contract.trim()] || ((contract) => { throw new Error(`Unknown contract: '${contract}'`); })(t.Contract.trim()),
  tradeDate: new Date(t.TradeDate),
  buy: t.Buy,
  sell: t.Sell,
  price: t.Price,
  currency: t.Currency,
  exchangeClearingFees: t.ExchangeClearingFees,
  nfaFee: t.NfaFee,
  commissionUSD: t.CommissionUSD,
  } as Execution));

main();
