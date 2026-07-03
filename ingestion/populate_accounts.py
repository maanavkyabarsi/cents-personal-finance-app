from main import sync_accounts

if __name__ == "__main__":
    rows = sync_accounts()
    for r in rows:
        print(r["account_id"], "->", r["display_name"])
    print(f"Wrote {len(rows)} accounts to gold.accounts")
