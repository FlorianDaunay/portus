import type { ComponentType } from "react";
import {
  BuildDiagram,
  ComposeDiagram,
  LayersDiagram,
  LifecycleDiagram,
  OverviewDiagram,
  PortsDiagram,
  VolumesDiagram,
} from "@/components/tutorial/Diagrams";

export interface Lesson {
  slug: string;
  title: string;
  summary: string;
  level: "Beginner" | "Intermediate";
  Diagram: ComponentType;
  sections: Array<{ heading: string; body: string }>;
  /** Commands shown at the end of the lesson. */
  commands: Array<{ command: string; note: string }>;
  /** Where to look in Portus to see it live. */
  tryIt: { label: string; to: string };
}

export const lessons: Lesson[] = [
  {
    slug: "what-is-docker",
    title: "What is Docker?",
    summary: "Images, containers and registries: the three words that explain everything else.",
    level: "Beginner",
    Diagram: OverviewDiagram,
    sections: [
      {
        heading: "The idea",
        body: "Docker packages an application with everything it needs (runtime, libraries, config) so it runs the same on any machine. That package is an image; running it gives you a container.",
      },
      {
        heading: "Image vs container",
        body: "An image is a read-only template, like a recipe. A container is a live process started from it, like a dish made from the recipe. You can start many containers from one image, and deleting a container never deletes the image.",
      },
      {
        heading: "Registries",
        body: "Images are stored in registries. Docker Hub is the default one: docker pull downloads an image from it, and docker run pulls it automatically if you don't have it yet.",
      },
    ],
    commands: [
      { command: "docker pull nginx", note: "Download the nginx image." },
      { command: "docker run -d --name web nginx", note: "Start a container from it, in the background." },
      { command: "docker ps", note: "List running containers." },
    ],
    tryIt: { label: "Open Images", to: "/images" },
  },
  {
    slug: "images-and-layers",
    title: "Images and layers",
    summary: "Why images are built in steps, and why rebuilding is usually fast.",
    level: "Beginner",
    Diagram: LayersDiagram,
    sections: [
      {
        heading: "A stack of layers",
        body: "Each instruction in a Dockerfile (FROM, COPY, RUN...) adds a read-only layer. Layers are shared between images, so two images built on the same base store that base only once.",
      },
      {
        heading: "The writable layer",
        body: "A container adds one thin writable layer on top. Files it creates or edits live there, and disappear when the container is removed. To keep data, use a volume.",
      },
      {
        heading: "Order matters for the cache",
        body: "Docker reuses a layer when its instruction and inputs haven't changed. Put what changes rarely (installing dependencies) before what changes often (copying your source) to keep rebuilds fast.",
      },
    ],
    commands: [
      { command: "docker build -t myapp .", note: "Build an image from the Dockerfile in this folder." },
      { command: "docker history myapp", note: "Show the layers of an image and their sizes." },
      { command: "docker image prune", note: "Remove dangling images you no longer need." },
    ],
    tryIt: { label: "Open Images", to: "/images" },
  },
  {
    slug: "container-lifecycle",
    title: "The container lifecycle",
    summary: "Created, running, exited, removed: what each state means and which command moves between them.",
    level: "Beginner",
    Diagram: LifecycleDiagram,
    sections: [
      {
        heading: "States",
        body: "A container is created, then started (running). When its main process ends or you stop it, it is exited: it no longer uses CPU or memory but keeps its filesystem. Removing it deletes that too.",
      },
      {
        heading: "Stop vs kill",
        body: "docker stop asks the process to quit (SIGTERM) and kills it after 10 seconds. docker kill stops it immediately. Prefer stop so the app can close files and connections cleanly.",
      },
      {
        heading: "Restart policies",
        body: "With --restart unless-stopped, Docker starts the container again after a crash or a reboot. Without a policy, an exited container stays exited until you start it.",
      },
    ],
    commands: [
      { command: "docker stop web", note: "Stop a running container gracefully." },
      { command: "docker start web", note: "Start it again, keeping its data." },
      { command: "docker rm -f web", note: "Force-remove it, even if running." },
    ],
    tryIt: { label: "Open Containers", to: "/containers" },
  },
  {
    slug: "volumes",
    title: "Volumes and persistent data",
    summary: "Keep a database's files when its container is replaced.",
    level: "Beginner",
    Diagram: VolumesDiagram,
    sections: [
      {
        heading: "Why volumes",
        body: "A container's own files vanish with it. A volume is a folder managed by Docker that lives outside any container: mount it at a path and everything written there survives.",
      },
      {
        heading: "Sharing",
        body: "Several containers can mount the same volume, for instance an app and its backup job. Portus marks a volume \"in use\" while a container mounts it.",
      },
      {
        heading: "Volumes vs bind mounts",
        body: "A named volume (-v data:/var/lib/data) is managed by Docker. A bind mount (-v ./src:/app) maps a folder of your machine, handy for development because edits show up instantly.",
      },
    ],
    commands: [
      { command: "docker volume create data", note: "Create a named volume." },
      { command: "docker run -d -v data:/var/lib/postgresql/data postgres", note: "Mount it into a container." },
      { command: "docker volume ls", note: "List volumes." },
    ],
    tryIt: { label: "Open Volumes", to: "/volumes" },
  },
  {
    slug: "ports-and-networking",
    title: "Ports and networking",
    summary: "How to reach a container from your browser, and how containers reach each other.",
    level: "Intermediate",
    Diagram: PortsDiagram,
    sections: [
      {
        heading: "Publishing a port",
        body: "A container has its own network. -p 8080:80 forwards port 8080 of your machine to port 80 inside the container, so http://localhost:8080 reaches the web server.",
      },
      {
        heading: "Container to container",
        body: "Containers on the same user-defined network find each other by name: an app can connect to the host \"db\" without publishing the database port at all. Publish only what you need from outside.",
      },
      {
        heading: "Only the host side changes",
        body: "If port 8080 is already taken, pick another host port (-p 9090:80). The container side is whatever the application listens on.",
      },
    ],
    commands: [
      { command: "docker run -d -p 8080:80 nginx", note: "Publish container port 80 on host port 8080." },
      { command: "docker port web", note: "Show a container's published ports." },
      { command: "docker network create app-net", note: "Create a network for your containers to share." },
    ],
    tryIt: { label: "Open Containers", to: "/containers" },
  },
  {
    slug: "dockerfile-and-builds",
    title: "Dockerfile and building images",
    summary: "Turn your own code into an image other people (and servers) can run.",
    level: "Intermediate",
    Diagram: BuildDiagram,
    sections: [
      {
        heading: "A recipe for an image",
        body: "A Dockerfile lists the steps that produce an image: start FROM a base image, COPY your files in, RUN the install commands, then say what to run with CMD. docker build executes the steps and tags the result.",
      },
      {
        heading: "Layers and the cache",
        body: "Each step becomes a layer, and Docker reuses a layer when nothing before it changed. Copy the dependency list and install first, your source code last: everyday edits then rebuild in seconds instead of minutes.",
      },
      {
        heading: "Keep it small",
        body: "Use a slim base image, add a .dockerignore so node_modules or .git stay out of the build, and consider a multi-stage build: compile in a big image, copy only the result into a small one.",
      },
    ],
    commands: [
      { command: "docker build -t myapp:1.0 .", note: "Build the Dockerfile of the current folder and tag the image." },
      { command: "docker run --rm -p 3000:3000 myapp:1.0", note: "Try the image you just built." },
      { command: "docker history myapp:1.0", note: "See the layers and how big each one is." },
    ],
    tryIt: { label: "Open Images", to: "/images" },
  },
  {
    slug: "docker-compose",
    title: "Docker Compose",
    summary: "Describe a multi-container app in one file and start it with one command.",
    level: "Intermediate",
    Diagram: ComposeDiagram,
    sections: [
      {
        heading: "One file, several services",
        body: "A compose file lists your services (web, api, db), their images, ports, volumes and environment. docker compose up creates the network, volumes and containers for all of them.",
      },
      {
        heading: "Projects",
        body: "Compose groups what it creates into a project, named after the folder by default. Portus shows these projects in the Compose page, and each container links back to its project.",
      },
      {
        heading: "Everyday workflow",
        body: "Edit the file, run up -d again and only the changed services are recreated. down stops and removes the containers and network, but keeps named volumes unless you add -v.",
      },
    ],
    commands: [
      { command: "docker compose up -d", note: "Create and start every service in the background." },
      { command: "docker compose logs -f web", note: "Follow the logs of one service." },
      { command: "docker compose down", note: "Stop and remove the project's containers and network." },
    ],
    tryIt: { label: "Open Compose", to: "/compose" },
  },
];

export const findLesson = (slug: string | undefined) => lessons.find((l) => l.slug === slug);
