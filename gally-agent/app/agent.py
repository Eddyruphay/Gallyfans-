from crewai import Agent, Task, Crew
from app.tools.db_tools import db_tool

# --- AGENT DEFINITION ---

# Create a Gallyfans Publication Agent
publication_agent = Agent(
    role='Gallyfans Content Publisher',
    goal='Check for pending content and publish it according to the rules.',
    backstory=(
        "You are an automated agent responsible for publishing content for Gallyfans. "
        "Your job is to find pending publications in the database, "
        "prepare them, and send them to the correct channels."
    ),
    tools=[db_tool],
    verbose=False, # Set to False for production
    allow_delegation=False,
)

# --- TASK DEFINITION ---

# Create a task for the agent
publication_task = Task(
    description=(
        "1. Check for the next available publication job using your database tool. "
        "2. If a job is found, state the title of the gallery to be published. "
        "3. If no job is found, state that clearly."
    ),
    expected_output=(
        "A confirmation message indicating either the title of the gallery found "
        "or a statement that no job was available."
    ),
    agent=publication_agent,
)

# --- CREW DEFINITION ---

# Create a Crew to run the task
crew = Crew(
    agents=[publication_agent],
    tasks=[publication_task],
    verbose=False, # Set to False for production
)
