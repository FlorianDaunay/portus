import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DockerCommand {
  id: string;
  command: string;
  description: string;
  category: string;
  custom?: boolean;
}

export const CUSTOM_CATEGORY = "My commands";

const builtin = (category: string, items: Array<[string, string]>): DockerCommand[] =>
  items.map(([command, description]) => ({ id: `${category}:${command}`, command, description, category }));

export const builtinCommands: DockerCommand[] = [
  ...builtin("Containers", [
    ["docker ps", "List running containers."],
    ["docker ps -a", "List all containers, including stopped ones."],
    ["docker run -d --name <name> -p <host>:<container> <image>", "Start a container in the background with a published port."],
    ["docker run -it --rm <image> sh", "Run a throwaway container with an interactive shell."],
    ["docker exec -it <container> sh", "Open a shell inside a running container."],
    ["docker logs -f --tail 100 <container>", "Follow the last 100 log lines."],
    ["docker stop <container>", "Stop a container gracefully."],
    ["docker restart <container>", "Restart a container."],
    ["docker rm -f <container>", "Remove a container, even if it is running."],
    ["docker inspect <container>", "Show all the details of a container as JSON."],
    ["docker stats", "Live CPU and memory usage of running containers."],
    ["docker cp <container>:<path> <local-path>", "Copy a file out of a container."],
  ]),
  ...builtin("Images", [
    ["docker images", "List local images."],
    ["docker pull <image>:<tag>", "Download an image from a registry."],
    ["docker build -t <name>:<tag> .", "Build an image from the Dockerfile in the current folder."],
    ["docker tag <image> <registry>/<name>:<tag>", "Give an image another name, for example before pushing it."],
    ["docker push <registry>/<name>:<tag>", "Upload an image to a registry."],
    ["docker rmi <image>", "Remove a local image."],
    ["docker history <image>", "Show the layers of an image."],
  ]),
  ...builtin("Volumes & networks", [
    ["docker volume ls", "List volumes."],
    ["docker volume create <name>", "Create a named volume."],
    ["docker volume rm <name>", "Remove a volume (its data is lost)."],
    ["docker network ls", "List networks."],
    ["docker network create <name>", "Create a network so containers can reach each other by name."],
    ["docker run -v <volume>:<path> <image>", "Mount a volume into a container."],
  ]),
  ...builtin("Compose", [
    ["docker compose up -d", "Create and start every service in the background."],
    ["docker compose down", "Stop and remove the project's containers and network."],
    ["docker compose ps", "List the project's containers."],
    ["docker compose logs -f <service>", "Follow the logs of a service."],
    ["docker compose build", "Rebuild the images of the services that have a build section."],
    ["docker compose pull", "Update the images used by the project."],
  ]),
  ...builtin("Cleanup & system", [
    ["docker system df", "Show how much disk space Docker uses."],
    ["docker system prune", "Remove stopped containers, unused networks and dangling images."],
    ["docker image prune -a", "Remove every image not used by a container."],
    ["docker volume prune", "Remove volumes not used by any container."],
    ["docker context ls", "List Docker endpoints; the * marks the active one."],
    ["docker info", "Show details about the engine."],
    ["docker version", "Show client and engine versions."],
  ]),
];

interface CommandState {
  custom: DockerCommand[];
  add: (input: { command: string; description: string; category?: string }) => void;
  remove: (id: string) => void;
}

/** Commands the user saved themselves; kept in localStorage like the appearance choice. */
export const useCustomCommands = create<CommandState>()(
  persist(
    (set) => ({
      custom: [],
      add: ({ command, description, category }) =>
        set((state) => ({
          custom: [
            ...state.custom,
            {
              id: `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              command: command.trim(),
              description: description.trim(),
              category: category?.trim() || CUSTOM_CATEGORY,
              custom: true,
            },
          ],
        })),
      remove: (id) => set((state) => ({ custom: state.custom.filter((c) => c.id !== id) })),
    }),
    { name: "portus-commands", version: 1 }
  )
);
