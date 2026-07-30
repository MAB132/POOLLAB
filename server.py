import os
import requests
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder='static')

API_TOKEN = "600c60c1ff4f28750b18b28f4146b8de1171d7c866abc227c252dab3d6e7fb91a6796277b1de4c67"
LABCOM_URL = "https://backend.labcom.cloud/graphql"

GRAPHQL_QUERY = """
query getContinents {
  CloudAccount {
    id
    email
    Accounts {
      id
      forename
      surname
      pooltext
      Measurements {
        id
        scenario
        parameter
        unit
        value
        timestamp
      }
    }
  }
}
"""

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/api/measurements')
def get_measurements():
    headers = {
        "Authorization": API_TOKEN,
        "Content-Type": "application/json"
    }
    payload = {
        "query": GRAPHQL_QUERY
    }
    try:
        response = requests.post(LABCOM_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    app.run(host='0.0.0.0', port=port, debug=False)
