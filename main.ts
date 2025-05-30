import { config } from "https://deno.land/x/dotenv@v1.0.1/mod.ts";

const env = config();


const fromStartOf = new Date("2024-01-01");

const toEndOf = new Date(); // Today's date

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

  executions.sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  const formatDate = (date: Date) =>
    date.toISOString().slice(0, 10).replace(/-/g, "");

  const filename = `executions.${formatDate(fromStartOf)}.${formatDate(toEndOf)}.csv`;

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
    filename,
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
    contract: t.Contract.trim(),
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
