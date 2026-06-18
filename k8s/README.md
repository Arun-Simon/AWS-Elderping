# ElderPing — Kubernetes Deployment Guide

This guide walks you through deploying the ElderPing microservices stack on a Kubernetes cluster with NFS-backed persistent storage, KGateway (Envoy) for API routing, and HAProxy for load balancing.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1 — NFS Server Setup](#step-1--nfs-server-setup)
4. [Step 2 — NFS External Provisioner in Kubernetes](#step-2--nfs-external-provisioner-in-kubernetes)
5. [Step 3 — Install KGateway](#step-3--install-kgateway)
6. [Step 4 — Install HAProxy Load Balancer](#step-4--install-haproxy-load-balancer)
7. [Step 5 — Deploy ElderPing](#step-5--deploy-elderping)
8. [Step 6 — Testing the Application](#step-6--testing-the-application)
9. [Manifest Structure](#manifest-structure)

---

## Architecture Overview

```
Internet
    │
    ▼
┌──────────────┐
│   HAProxy    │  ← Load balancer on a dedicated VM/instance
│  (port 80)   │    Distributes traffic across K8s nodes
└──────┬───────┘
       │
       ▼  (NodePort on each K8s Node)
┌────────────────────────────────────────────┐
│           Kubernetes Cluster               │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │    KGateway (Envoy)                 │   │
│  │    Routes /api/* to backends        │   │
│  │    Routes / to ui-service           │   │
│  └──────┬──────────────────────────────┘   │
│         │                                  │
│    ┌────┴──────────────────────────────┐   │
│    │        elderping namespace        │   │
│    │                                   │   │
│    │  ui-service  (Nginx + React SPA)  │   │
│    │  auth-service                     │   │
│    │  health-service                   │   │
│    │  reminder-service                 │   │
│    │  alert-service                    │   │
│    │                                   │   │
│    │  auth-db    (StatefulSet + NFS)   │   │
│    │  health-db  (StatefulSet + NFS)   │   │
│    │  reminder-db(StatefulSet + NFS)   │   │
│    │  alert-db   (StatefulSet + NFS)   │   │
│    └───────────────────────────────────┘   │
└────────────────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   NFS Server        │
         │  (Persistent Data)  │
         └─────────────────────┘
```

---

## Prerequisites

- A Linux-based Kubernetes cluster (v1.28+) with at least 2 worker nodes
- `kubectl` configured and pointing to your cluster
- `helm` v3 installed
- A dedicated Linux instance (can be a cluster node) to run the NFS server
- Ports `80` open on all nodes in your firewall / security group

---

## Step 1 — NFS Server Setup

Run these commands on the dedicated **NFS server instance** (Ubuntu/Debian):

```bash
# 1. Install NFS kernel server
sudo apt-get update && sudo apt-get install -y nfs-kernel-server

# 2. Create the shared export directory
sudo mkdir -p /srv/nfs/elderping
sudo chown -R nobody:nogroup /srv/nfs/elderping
sudo chmod 777 /srv/nfs/elderping

# 3. Configure the NFS export
# Replace 10.0.0.0/24 with your actual cluster node CIDR
echo "/srv/nfs/elderping  10.0.0.0/24(rw,sync,no_subtree_check,no_root_squash)" | sudo tee -a /etc/exports

# 4. Apply the export and restart NFS
sudo exportfs -a
sudo systemctl restart nfs-kernel-server
sudo systemctl enable nfs-kernel-server

# 5. Verify the export is active
sudo exportfs -v
```

**On every Kubernetes worker node**, install the NFS client:

```bash
sudo apt-get install -y nfs-common
```

---

## Step 2 — NFS External Provisioner in Kubernetes

This installs the `nfs-subdir-external-provisioner` which dynamically creates PersistentVolumes using your NFS server and creates a StorageClass named `nfs-client`.

```bash
# Add the NFS provisioner Helm repo
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update

# Install the provisioner
# Replace NFS_SERVER_IP with the actual IP of your NFS server instance
helm install nfs-provisioner \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --create-namespace \
  --set nfs.server=<NFS_SERVER_IP> \
  --set nfs.path=/srv/nfs/elderping \
  --set storageClass.name=nfs-client \
  --set storageClass.defaultClass=true

# Verify the StorageClass is ready
kubectl get storageclass
```

You should see `nfs-client` listed as the default storage class.

---

## Step 3 — Install KGateway

KGateway is an Envoy-based Kubernetes Gateway API implementation.

```bash
# Install the Kubernetes Gateway API CRDs first
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

# Add the kgateway Helm repo
helm repo add kgateway https://kgateway.dev/charts
helm repo update

# Install kgateway in its own namespace
helm install kgateway kgateway/kgateway \
  --namespace kgateway-system \
  --create-namespace \
  --version 2.0.0

# Verify kgateway pods are running
kubectl get pods -n kgateway-system

# Check the Gateway has an external IP assigned (may take 1-2 min)
kubectl get gateway -n elderping
```

> **Note:** KGateway creates a LoadBalancer Service. On a bare-metal cluster, the EXTERNAL-IP will be `<pending>` unless you have MetalLB or a cloud provider. In that case, use the NodePort and route HAProxy to any node IP.

To get the NodePort used by KGateway:
```bash
kubectl get svc -n kgateway-system
```

---

## Step 4 — Install HAProxy Load Balancer

Run these commands on a **dedicated HAProxy instance** (Ubuntu/Debian). HAProxy will distribute incoming HTTP requests across your Kubernetes worker nodes (pointing to the KGateway NodePort).

```bash
# 1. Install HAProxy
sudo apt-get update && sudo apt-get install -y haproxy

# 2. Configure HAProxy
# Replace NODE_IP_1, NODE_IP_2 etc. with your actual k8s worker node IPs
# Replace KGATEWAY_NODEPORT with the NodePort from the previous step (e.g. 32080)
sudo tee /etc/haproxy/haproxy.cfg > /dev/null <<'EOF'
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000ms
    timeout client  50000ms
    timeout server  50000ms
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

# Health check statistics page (optional, access at :8404/stats)
frontend stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats admin if LOCALHOST

# Main HTTP frontend — accepts traffic on port 80
frontend elderping_http
    bind *:80
    default_backend elderping_k8s_nodes

# Backend — load balances across k8s nodes
backend elderping_k8s_nodes
    balance roundrobin
    option httpchk GET /
    http-check expect status 200
    server node1 <NODE_IP_1>:<KGATEWAY_NODEPORT> check inter 10s rise 2 fall 3
    server node2 <NODE_IP_2>:<KGATEWAY_NODEPORT> check inter 10s rise 2 fall 3
    # Add more nodes as needed:
    # server node3 <NODE_IP_3>:<KGATEWAY_NODEPORT> check inter 10s rise 2 fall 3
EOF

# 3. Validate config and restart
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl enable haproxy

# 4. Check status
sudo systemctl status haproxy
```

---

## Step 5 — Deploy ElderPing

Apply all Kubernetes manifests in order:

```bash
# Clone the repo (if not already done)
git clone https://github.com/Arun-Simon/ElderPinq.git
cd ElderPinq

# 1. Create the namespace
kubectl apply -f k8s/namespace.yaml

# 2. Apply secrets (edit k8s/secrets.yaml with your base64-encoded values first!)
# Generate a secure db password:
# echo -n 'YourSecurePassword' | base64
# echo -n 'YourSecureJWTSecret' | base64
kubectl apply -f k8s/secrets.yaml

# 3. Deploy databases (StatefulSets with NFS PVCs)
kubectl apply -f k8s/databases/

# 4. Wait for all databases to become ready
kubectl rollout status statefulset/auth-db -n elderping
kubectl rollout status statefulset/health-db -n elderping
kubectl rollout status statefulset/reminder-db -n elderping
kubectl rollout status statefulset/alert-db -n elderping

# 5. Deploy all backend services + ui-service
kubectl apply -f k8s/services/

# 6. Apply KGateway routing rules
kubectl apply -f k8s/ingress/kgateway.yaml

# 7. Verify everything is running
kubectl get all -n elderping
```

**Update the image names** in each `k8s/services/*.yaml` file to point to your actual published Docker images. For example:
```yaml
image: ghcr.io/<your-github-username>/elderpinq/auth-service:latest
```

---

## Step 6 — Testing the Application

### Check Pod Status
```bash
# All pods should be Running
kubectl get pods -n elderping

# Check HPA status (TARGETS will show CPU usage)
kubectl get hpa -n elderping

# Check PVCs are Bound to NFS volumes
kubectl get pvc -n elderping
```

### Test Backend Health Endpoints
```bash
# Port-forward auth-service locally
kubectl port-forward svc/auth-service 3001:3000 -n elderping

# In another terminal, test the health endpoint
curl http://localhost:3001/health
# Expected: {"status":"ok","service":"auth-service"}

# Test registration
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test1234","role":"elder"}'
```

### Test via HAProxy (End-to-End)
```bash
# Replace <HAPROXY_IP> with your HAProxy instance's public IP
HAPROXY_IP=<HAPROXY_IP>

# Test the UI is reachable
curl -I http://$HAPROXY_IP/
# Expected: HTTP/1.1 200 OK

# Test auth API through the full stack
curl -X POST http://$HAPROXY_IP/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"grandma","password":"password123","role":"elder"}'

# Login
curl -X POST http://$HAPROXY_IP/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"grandma","password":"password123"}'
# Expected: {"token":"...","user":{...,"invite_code":"XXXXXX"}}

# Test health service
curl http://$HAPROXY_IP/api/health/health
# Expected: {"status":"ok","service":"health-service"}
```

### Test HPA Scaling
```bash
# Watch the HPA scale up under load
kubectl get hpa -n elderping --watch

# Generate load (in a separate terminal) using kubectl run
kubectl run -i --tty load-generator \
  --rm \
  --image=busybox:1.28 \
  --restart=Never \
  -n elderping \
  -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://ui-service/; done"
```

### View HAProxy Stats
```bash
# Open in browser: http://<HAPROXY_IP>:8404/stats
# Shows live connection counts, health check status per backend node
```

### Troubleshooting Commands
```bash
# View logs for a specific pod
kubectl logs -f deployment/auth-service -n elderping

# Describe a pod to see events/errors
kubectl describe pod -l app=auth-service -n elderping

# Check NFS PVC binding
kubectl describe pvc auth-db-pvc -n elderping

# Shell into a running container
kubectl exec -it deployment/auth-service -n elderping -- sh
```

---

## Manifest Structure

```
k8s/
├── namespace.yaml              # elderping namespace
├── secrets.yaml                # DB password + JWT secret (base64)
├── databases/
│   ├── auth-db.yaml            # ConfigMap + PVC + Service + StatefulSet
│   ├── health-db.yaml          # ConfigMap + PVC + Service + StatefulSet
│   ├── reminder-db.yaml        # ConfigMap + PVC + Service + StatefulSet
│   └── alert-db.yaml           # ConfigMap + PVC + Service + StatefulSet
├── services/
│   ├── auth-service.yaml       # Deployment + Service + HPA
│   ├── health-service.yaml     # Deployment + Service + HPA
│   ├── reminder-service.yaml   # Deployment + Service + HPA
│   ├── alert-service.yaml      # Deployment + Service + HPA
│   └── ui-service.yaml         # Deployment + Service + HPA
└── ingress/
    └── kgateway.yaml           # GatewayClass + Gateway + HTTPRoute
```
