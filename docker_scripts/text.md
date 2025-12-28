ganache-docker/
│
├── Dockerfile
└── data/          # This will hold chainData (optional)


docker build -t my-ganache .


docker run -d \
  --name ganache \
  -p 8545:8545 \
  -v $(pwd)/data:/data \
  my-ganache
