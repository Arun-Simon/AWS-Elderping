# ElderPing 🩺

A production-grade, enterprise-ready microservices-based elderly care application built with **Node.js (Express)**, **React (Vite)**, **Tailwind CSS**, and **PostgreSQL**. The platform is designed as a DevOps showcase featuring cloud-native architectures on **Amazon Web Services (AWS)** using **Amazon EKS**, **Terraform (IaC)**, and **GitOps (ArgoCD)**.

---

## 🏗️ Architecture & Request Routing

ElderPing balances high availability, granular security (RBAC/ABAC), real-time alerts, and cost-aware generative AI. 

### 1. External Ingress & Request Routing Flow
Client traffic passes through Route 53 DNS records, AWS WAFv2 threat detection, and an Application Load Balancer (ALB). It is then distributed to the EKS cluster via **KGateway** (an Envoy-based Gateway API implementation).

```mermaid
graph TD
    Client["Client / User Browser"] -->|UI Assets (HTTPS)| CF["AWS CloudFront CDN"]
    CF -->|Origin Fetch| S3["Amazon S3 UI Bucket"]
    
    Client -->|API Requests (HTTPS)| API_DNS["api.elderping.online (Route 53)"]
    API_DNS --> ALB["AWS Application Load Balancer"]
    ALB -->|Inspected by| WAF["AWS WAFv2 Web ACL"]
    ALB -->|Forward to NodePort| KG["KGateway (Envoy Proxy)"]
    
    subgraph EKS["Amazon EKS Cluster (healthcare Namespace)"]
        KG -->|Route /api/auth/*| Auth["auth-service"]
        KG -->|Route /api/health/*| Health["health-service"]
        KG -->|Route /api/reminder/*| Reminder["reminder-service"]
        KG -->|Route /api/alert/*| Alert["alert-service"]
        KG -->|Route /api/ai/*| AI["ai-service"]
        KG -->|Route /api/report/*| Report["report-service"]
        KG -->|Route /api/appointment/*| Appt["appointment-service"]
        KG -->|Route /api/notes/*| Notes["notes-service"]
        KG -->|Route /api/notification/*| Notif["notification-service"]
        KG -->|Route /api/audit/*| Audit["audit-service"]
        KG -->|Route /api/finops/*| FinOps["finops-service"]
        KG -->|Route /| UI["ui-service (Nginx Frontend Static Router)"]
    end
```

### 2. Service Dependencies & Integrations
The backend components are highly decoupled and communicate via synchronous REST APIs or asynchronous event queues (Amazon SQS/EventBridge).

```mermaid
graph TD
    subgraph DBs["Isolated Databases (RDS PostgreSQL)"]
        db_auth["users_db"]
        db_health["health_db"]
        db_reminder["reminder_db"]
        db_alert["alert_db"]
        db_appt["appointment_db"]
        db_notes["notes_db"]
        db_ai["ai_db"]
        db_report["report_db"]
        db_notif["notification_db"]
        db_audit["audit_db"]
        db_finops["finops_db"]
    end

    subgraph ServiceMesh["EKS Healthcare Pods"]
        Auth["auth-service"] --> db_auth
        Health["health-service"] --> db_health
        Reminder["reminder-service"] --> db_reminder
        Alert["alert-service"] --> db_alert
        Appt["appointment-service"] --> db_appt
        Notes["notes-service"] --> db_notes
        AI["ai-service"] --> db_ai
        Report["report-service"] --> db_report
        Notif["notification-service"] --> db_notif
        Audit["audit-service"] --> db_audit
        FinOps["finops-service"] --> db_finops
        
        Report -->|Fetch Vitals (REST)| Health
        Report -->|Fetch Compliance (REST)| Reminder
        Report -->|Fetch Appointments (REST)| Appt
        Report -->|Fetch Alerts (REST)| Alert
        Report -->|Analyze Risk (REST)| AI
        Report -->|Trigger Report Email (REST)| Notif
        
        AI -->|Generate Voice Note (REST)| Notes
        
        FinOps -->|AI Insights (REST)| AI
        
        AllServices["All Services"] -.->|Audit Log Requests (REST)| Audit
    end

    subgraph AWSCloud["AWS Integrations"]
        Report -->|Store PDF/JSON reports| S3_Rep["S3 Reports Bucket"]
        AI -->|Invoke Model (SDK)| Bedrock["Amazon Bedrock (Claude 3)"]
        FinOps -->|Get Billing Metrics (SDK)| CE["AWS Cost Explorer"]
        Notif -->|Send Email (SDK)| SES["Amazon SES"]
        Notif -->|Send SMS (SDK)| SNS["Amazon SNS"]
        SQS["Amazon SQS Queue"] -->|Poll Notifications| Notif
        EB["Amazon EventBridge"] -->|Publish Scheduler Events| SQS
        Appt -->|Trigger Scheduler Events| EB
    end
```

---

## 🔌 Microservices Catalog

ElderPing consists of **12 microservices**, each maintaining domain boundaries and a dedicated database instance:

| Service | Port | Database | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| `ui-service` | `8080` | *None* | React SPA served via Nginx. Dashboards for elders, family members, and admins. |
| `auth-service` | `3001` | `users_db` | Authentication, RBAC role management, and ABAC family-to-elder link configurations. |
| `health-service` | `3002` | `health_db` | Check-in logging and tracking vital logs (heart rate, blood pressure, oxygen levels). |
| `reminder-service` | `3003` | `reminder_db` | Medication rules configurations, schedules, and daily taken/missed compliance tracking. |
| `alert-service` | `3004` | `alert_db` | Logs high-priority alerts (missed medications, critical vitals) for operator triage. |
| `ai-service` | `3000` | `ai_db` | Core assistant wrapper integrating with **Amazon Bedrock** (Claude 3 Haiku). |
| `appointment-service`| `3000` | `appointment_db` | Clinic schedules and doctor visits bookings manager. |
| `notes-service` | `3000` | `notes_db` | Allows caregivers/relatives to log textual care notes and comments for the elder. |
| `report-service` | `3000` | `report_db` | Runs data aggregations, obtains AI risk scores, and uploads report sheets to S3. |
| `notification-service`| `3000`| `notification_db`| Dispatches notifications via AWS SES (Email), AWS SNS (SMS), and checks preferences. |
| `audit-service` | `3000` | `audit_db` | Collects structured audit logs for administrative state adjustments (actor IP, diff states). |
| `finops-service` | `3000` | `finops_db` | Pulls cloud bills via AWS Cost Explorer and triggers Bedrock cost-optimization logs. |

---

## 🚀 Quick Start (Local Sandbox Development)

For local development and testing, you can spin up the core platform using Docker Compose.

### Prerequisites
* **Node.js**: Version `>= 18.x`
* **Docker Desktop**: Version `>= 24.x` with Docker Compose `>= 2.x`
* **Git**: Installed and configured

### 1. Clone & Configure
```bash
git clone https://github.com/Arun-Simon/AWS-Elderping.git
cd AWS-Elderping

# Create the environment profile from the template
cp .env.example .env
```
Ensure that `MOCK_AWS=true` is set in your `.env`. This forces backend services to use offline mock systems instead of calling live AWS APIs (Cognito, Bedrock, S3, SES, SNS).

### 2. Launch Local Stack
```bash
docker compose up --build -d
```
This command spins up **9 containers** (the core 5 backend/frontend services + 4 local PostgreSQL servers). Database tables are initialized automatically using scripts in `db-init/`.

Verify that all containers are healthy:
```bash
docker compose ps
```

### 3. Register Demo Accounts & Use APIs
Access the React frontend at **[http://localhost:8080](http://localhost:8080)**.

To manually register roles for sandbox tests, use `curl` to interface with the local authentication port:
```bash
# Register an Elder user
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"grandma","password":"password123","role":"ELDER"}'

# Register a Family Caregiver
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"daughter","password":"password123","role":"FAMILY"}'
```

---

## 🛡️ Identity, Security & Authorization (RBAC & ABAC)

Data privacy is enforced at both the API routing level and database queries layer:

* **Dual Authentication Flow**: The auth middleware evaluates the incoming header `Authorization: Bearer <Token>`. 
  * In **production**, it executes asymmetric verification (**RS256**) by pulling public JSON Web Key Sets (JWKS) directly from Amazon Cognito User Pools.
  * In **sandbox/development**, it falls back to a symmetric verification (**HS256**) check utilizing the local `JWT_SECRET`.
* **Role-Based Access Control (RBAC)**: Enforces endpoints restrictions based on role profiles:
  * `ELDER`: Basic vitals reporting and checking in.
  * `FAMILY`: Viewing dashboards, summaries, and leaving notes.
  * `ADMIN` / `SUPER_ADMIN`: Access to audit logs, clinic appointments, alerts overrides, and billing views.
* **Attribute-Based Access Control (ABAC)**: Ensures caregivers can only fetch vitals or notes for elders explicitly linked to their account in the `users_db` `family_links` mappings.

---

## 📊 Observability & FinOps Cost Governance

### Cluster Observability Stack
* **Prometheus & Grafana**: Deployed inside EKS using Custom `ServiceMonitors`. Grafana visualizes active connections, HTTP volumes, and resource limits.
* **Loki Log Aggregation**: Aggregates container stdout/stderr logs, allowing cluster administrators to query logs across all 12 pods.
* **AWS CloudWatch Container Insights**: Captures hardware telemetry and triggers system alarms if CPU/memory utilization exceeds critical thresholds.

### Generative AI FinOps Workflow
To govern infrastructure costs, the platform features dynamic cost optimization:
1. `finops-service` pulls billing metrics via the AWS Cost Explorer SDK.
2. A request is made to `ai-service` which targets **Amazon Bedrock (Claude 3 Haiku)**.
3. The AI returns actionable cost mitigation plans (e.g., scaling worker nodes down off-peak, moving to Serverless Aurora, consolidating development DBs).
4. Optimization suggestions are cached in PostgreSQL `finops_db` and reviewed by Super Admins on the UI.

---

## 📂 Project Structure Map

```
AWS-Elderping/
├── docker-compose.yaml        # Local development stack (core services)
├── .env.example               # Root env template
├── db-init/                   # Local db schema SQL seeds
├── db-migrations/             # Versioned schema migrations for all 11 databases
├── docs/                      # Comprehensive system guides
├── ai-service/                # Bedrock LLM wrapper & prompt processor
├── alert-service/             # High priority health alert engine
├── appointment-service/       # Doctor appointments manager
├── audit-service/             # Admin operations audit trails log
├── auth-service/              # Cognito token verifier & user links database
├── finops-service/            # Cost Explorer integration & AI advisor trigger
├── health-service/            # Health vitals and check-in processor
├── notes-service/             # Text notes and caregiver flags storage
├── notification-service/      # SMS/Email client dispatcher (SES, SNS, SQS)
├── reminder-service/          # Medication guidelines compiler
├── report-service/            # Weekly telemetry aggregator and S3 uploader
├── ui-service/                # React (Vite) client container
├── helm/                      # K8s Helm packages for services configuration
├── infrastructure/            # Terraform configurations (VPC, EKS, RDS, etc.)
├── k8s/                       # Gateway API, HPA, and StatefulSet manifests
├── monitoring/                # Prometheus dashboards and service monitors
└── argocd-apps/               # ArgoCD App-of-Apps GitOps templates
```

---

## 📖 Deep-Dive Documentation Suite

For comprehensive step-by-step configurations and deployment guidelines, review the dedicated guides in the `docs/` folder:

* 🚀 **[Developer Onboarding Guide](docs/onboarding.md)**: Workspace configuration, db migrations workflow, and building your first API endpoint.
* 🏗️ **[Architecture Overview](docs/architecture.md)**: Data flows, Mermaid diagrams, database configurations, and communication layouts.
* ☁️ **[AWS Infrastructure (Terraform)](docs/infrastructure.md)**: Cloud network layouts, VPC configurations, subnets, Cognito setup, and Route 53 CDN settings.
* ☸️ **[Kubernetes & GitOps Deployments](docs/kubernetes.md)**: EKS configurations, Gateway API rules, StatefulSet volumes, and ArgoCD application waves.
* 🛡️ **[Security & Compliance](docs/security.md)**: Cognito identity tokens, RBAC/ABAC middlewares, CloudTrail logs, and VPC security groups.
* 📊 **[Observability & Cost Controls](docs/observability.md)**: Grafana dashboards, Loki log queries, CloudWatch alarms, and Bedrock FinOps advisor.
* 🔌 **[API Endpoints Reference](docs/api-reference.md)**: Full REST API specs, authorization requirements, payloads, and response structures.
