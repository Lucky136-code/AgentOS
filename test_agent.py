import urllib.request
import json
import time

# Point this to your local server since Vercel firewall blocks basic python scripts sometimes
BASE_URL = "http://localhost:3000/api/v1"

def print_step(msg):
    print(f"\n[+] {msg}")
    time.sleep(1) # Small delay to watch the dashboard update live

def run_agent():
    print("Booting up Python Researcher Agent...")

    # 1. REGISTER THE AGENT
    print_step("Registering with Agent OS...")
    req = urllib.request.Request(f"{BASE_URL}/register", method="POST")
    req.add_header('User-Agent', 'Mozilla/5.0')
    req.add_header('Content-Type', 'application/json')
    data = json.dumps({
        "name": "Python Researcher",
        "capabilities": ["web_scrape", "data_analysis"],
        "model": "local-python-script",
        "memory": True
    }).encode('utf-8')
    
    response = urllib.request.urlopen(req, data=data)
    reg_data = json.loads(response.read().decode('utf-8'))
    api_key = reg_data['api_key']
    print(f"    -> Success! Got API Key: {api_key[:15]}...")

    # 2. DISCOVER TOOLS
    print_step("Discovering available tools on the network...")
    req = urllib.request.Request(f"{BASE_URL}/discover?capability=search", method="GET")
    req.add_header('User-Agent', 'Mozilla/5.0')
    response = urllib.request.urlopen(req)
    tools = json.loads(response.read().decode('utf-8'))
    print(f"    -> Found {tools['total']} tools. Example: {tools['services'][0]['name']}")

    # 3. SAVE MEMORY
    print_step("Storing context in Agent OS memory bank...")
    req = urllib.request.Request(f"{BASE_URL}/memory", method="PUT")
    req.add_header('User-Agent', 'Mozilla/5.0')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')
    mem_data = json.dumps({
        "operation": "store",
        "namespace": "research",
        "data": {
            "key": "current_focus",
            "value": "Looking into AI agent infrastructure."
        }
    }).encode('utf-8')
    urllib.request.urlopen(req, data=mem_data)
    print("    -> Memory stored successfully.")

    # 4. EXECUTE A TASK
    print_step("Executing a task...")
    req = urllib.request.Request(f"{BASE_URL}/execute", method="POST")
    req.add_header('User-Agent', 'Mozilla/5.0')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')
    task_data = json.dumps({
        "task": "Analyze infrastructure patterns for AI agents.",
        "tools": ["svc_web_search"],
        "max_steps": 5
    }).encode('utf-8')
    
    response = urllib.request.urlopen(req, data=task_data)
    exec_result = json.loads(response.read().decode('utf-8'))
    print(f"    -> Task Completed in {exec_result['duration_ms']}ms.")
    print(f"    -> Final Cost: {exec_result['cost']}")
    
    print("\n✅ Agent run complete! Check your Vercel Dashboard.")

if __name__ == "__main__":
    run_agent()
