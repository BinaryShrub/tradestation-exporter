# TradeStation Exporter

Bulk export tradestation executions for multiple accounts across any timeframe:

## How to Run

####
1. Copy the sample env file `cp .env.sample .env` and update it accordingly:

    ```
    # .env
    JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
    ACCOUNT_ID_LIST=123ABC45,678DEF90
    ```

    > Use Chrome Dev Tools to get your Bearer Token
    ![Example of getting the token in Chrome Dev Tools](assets/token_example.png)

2. In `main.ts` pick your `fromStartOf` and `toEndOf` dates

    ```ts
    const fromStartOf = new Date("2024-01-01");

    const toEndOf = new Date(); // Today's date

4. Run `./run.sh` and the export will run and write an executions csv file.