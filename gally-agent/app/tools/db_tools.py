import os
import json
from sqlalchemy import create_engine, text
from crewai_tools import BaseTool
from app.logger import logger

class DBTools(BaseTool):
    name: str = "Database Tools"
    description: str = "A set of tools for interacting with the Gallyfans database."
    _engine = None

    def __init__(self):
        super().__init__()
        db_url = os.getenv("DATABASE_URL")
        if db_url:
            self._engine = create_engine(db_url)
        else:
            logger.warning("DATABASE_URL environment variable not set. Database tools will be unavailable.")

    def _run(self, command: str):
        if not self._engine:
            return "Error: Database engine is not initialized. Check DATABASE_URL."
        if command == "fetch_and_lock_next_job":
            return self.fetch_and_lock_next_job()
        return "Unknown command."

    def fetch_and_lock_next_job(self) -> str:
        """
        Fetches the next available job from the 'PublishedItem' table,
        locks the row, and updates its status to 'processing'.
        """
        logger.info("--- TOOL EXECUTED: fetch_and_lock_next_job ---")
        
        select_query = text("""
            SELECT id, "galleryTitle", "creatorName", images
            FROM "PublishedItem"
            WHERE status = 'pending'
            ORDER BY "createdAt"
            LIMIT 1
            FOR UPDATE SKIP LOCKED;
        """)

        update_query = text("""
            UPDATE "PublishedItem"
            SET status = 'processing', "processingStartedAt" = NOW()
            WHERE id = :job_id;
        """)

        try:
            with self._engine.begin() as connection:
                result = connection.execute(select_query).fetchone()

                if result:
                    job_id = result.id
                    logger.info(f"--- Found job with ID: {job_id} ---")
                    
                    connection.execute(update_query, {"job_id": job_id})
                    
                    job_data = dict(result._mapping)
                    
                    if isinstance(job_data.get('images'), str):
                        job_data['images'] = json.loads(job_data['images'])

                    logger.info(f"--- Locked and updated job {job_id} to 'processing' ---")
                    return f"Job found: {json.dumps(job_data)}"
                else:
                    logger.info("--- No pending jobs found ---")
                    return "No pending jobs available."
        except Exception as e:
            logger.error(f"--- DATABASE ERROR in fetch_and_lock_next_job: {e} ---", exc_info=True)
            return f"An error occurred while interacting with the database: {e}"

# Instantiate the tool for use in the agent
db_tool = DBTools()
