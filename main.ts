import { config } from "https://deno.land/x/dotenv@v1.0.1/mod.ts";

const env = config();


const fromStartOf = new Date("2024-01-01");

const toEndOf = new Date(); // Today's date

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
  const executions: Execution[] = [];
  const accountIds = env.ACCOUNT_ID_LIST.includes(",")
      ? env.ACCOUNT_ID_LIST.split(",")
      : [env.ACCOUNT_ID_LIST]

  for (const accountId of accountIds) {
    console.log(`Loading executions for account: ${accountId}`);
    
    executions.push(
      ...await loadAllExecutions({
        jwt: env.JWT,
        accountId,
        fromStartOf,
        toEndOf,
      }),
    );
  }

  writeCsv(
    [
      "accountId",
      "contract",
      "tradeDate",
      "buy",
      "sell",
      "price",
      "currency",
      "exchangeClearingFees",
      "nfaFee",
      "commissionUSD",
    ],
    executions,
    "executions.csv",
  );
};

const writeCsv = (headers: string[], data: any[], filename: string) => {
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value instanceof Date) {
          // Format as YYYY-MM-DD (ISO date without time)
          return value.toISOString().slice(0, 10);
        }
        return value;
      }).join(",")
    ),
  ].join("\n");
  console.log("CSV size (bytes):", new TextEncoder().encode(csvContent).length);

  Deno.writeTextFileSync(filename, csvContent);
};

const loadAllExecutions = async (config: {
  jwt: String;
  accountId: String;
  fromStartOf: Date;
  toEndOf: Date;
}) => {
  const { fromStartOf, toEndOf, ...rest } = config;
  const executions: Execution[] = [];
  let current = new Date(fromStartOf);
  const end = new Date(toEndOf);

  while (current < end) {
    const chunkStart = new Date(current);
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setMonth(chunkEnd.getMonth() + 2);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const chunkExecutions = await loadExecutions({
      ...rest,
      fromStartOf: new Date(chunkStart),
      toEndOf: new Date(chunkEnd),
    });
    executions.push(...chunkExecutions);

    // 2 QPS: wait 500ms between requests
    await new Promise((res) => setTimeout(res, 500));
    current = new Date(chunkEnd);
  }

  return executions;
};

const loadExecutions = async (
  config: {
    jwt: String;
    accountId: String;
    fromStartOf: Date;
    toEndOf: Date;
  },
) => {
  const response = await fetch(
    "https://api.tradestation.com/graphql/v1/live/graphql",
    {
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
    },
  );

  const json = await response.json();

  if (!json.data || !json.data.getHistoricalFuturesTransactions) {
    throw new Error(
      "Invalid response from API:\n" + JSON.stringify(json, null, 2),
    );
  }

  if (
    !json.data.getHistoricalFuturesTransactions.Transactions ||
    json.data.getHistoricalFuturesTransactions.Transactions.length === 0
  ) {
    return [];
  }

  const rawExecutions = json.data.getHistoricalFuturesTransactions.Transactions
    .flatMap((transaction: any) => transaction.Details.Transactions);
  return parseExecutions(rawExecutions);
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
};

const parseExecutions = (transactions: any[]): Execution[] =>
  transactions.map((t) => ({
    accountId: t.AccountId,
    contract: symbolByContact[t.Contract.trim()] || ((contract) => {
      throw new Error(`Unknown contract: '${contract}'`);
    })(t.Contract.trim()),
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
