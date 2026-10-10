import sys
import json
from plaid.model.item_webhook_update_request import ItemWebhookUpdateRequest
from main import secret_value_puller, get_plaid_client

# Points every item in plaid-item-map at the given webhook URL.
# Usage: python set_webhook.py https://REGION-PROJECT_ID.cloudfunctions.net/handle-webhook
if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python set_webhook.py WEBHOOK_URL")
    webhook_url = sys.argv[1]

    client = get_plaid_client()
    plaid_item_map = json.loads(secret_value_puller("plaid-item-map"))
    for item_id, secret_name in plaid_item_map.items():
        request = ItemWebhookUpdateRequest(
            access_token=secret_value_puller(secret_name),
            webhook=webhook_url,
        )
        response = client.item_webhook_update(request)
        print(f"{item_id} -> {response.item.webhook}")
