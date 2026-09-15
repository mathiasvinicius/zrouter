docker stop zrouter
docker rm zrouter
docker build -t zrouter .
docker run -d --name zrouter -p 20129:20129 --env-file .env -v zrouter-data:/app/data zrouter