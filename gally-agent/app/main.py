import os
from fastapi import FastAPI, HTTPException, BackgroundTasks
from dotenv import load_dotenv

# Load environment variables from a .env file
load_dotenv()

# Import the crew and logger
from app.agent import crew
from app.logger import logger

# --- ENVIRONMENT VARIABLE CHECKS ---
# Ensure critical environment variables are set.
if not os.getenv("GOOGLE_API_KEY"):
    raise ImportError(
        "GOOGLE_API_KEY is not set. Please create a .env file and add your key."
        "You can get a key from Google AI Studio."
    )

if not os.getenv("DATABASE_URL"):
    raise ImportError(
        "DATABASE_URL is not set. Please create a .env file and add your connection string."
    )

# --- BACKGROUND TASK DEFINITION ---

def run_crew_cycle():
    """Encapsulates the crew kickoff call for background execution."""
    try:
        logger.info("--- KICKING OFF CREW CYCLE ---")
        result = crew.kickoff(inputs={'trigger_time': 'now'})
        logger.info(f"--- CREW CYCLE COMPLETED --- Result: {result}")
    except Exception as e:
        logger.error(f"--- ERROR DURING CREW CYCLE --- Exception: {e}", exc_info=True)


# --- FASTAPI APP DEFINITION ---

app = FastAPI(
    title="Gally Agent API",
    description="An API to trigger and manage the Gallyfans Publication Agent.",
)

@app.get("/")
def read_root():
    return {"status": "Gally Agent is alive."}

@app.post("/trigger-cycle")
def trigger_cycle(background_tasks: BackgroundTasks):
    """
    This endpoint triggers a single run of the Gally Agent's publication cycle
    in the background. It returns immediately.
    """
    logger.info("--- CYCLE TRIGGERED VIA API ---")
    background_tasks.add_task(run_crew_cycle)
    return {"status": "success", "detail": "Publication cycle triggered in the background."}

