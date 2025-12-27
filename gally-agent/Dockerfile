# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /code

# Copy the dependencies file to the working directory
COPY ./requirements.txt /code/requirements.txt

# Install any needed dependencies specified in requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the application's code
COPY ./app /code/app

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define the command to run the app.
# Uvicorn is a lightning-fast ASGI server.
# --host 0.0.0.0 makes the server accessible from outside the container.
# --port 8000 matches the EXPOSE instruction.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
