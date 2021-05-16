/*
 * Copyright (C) 2021 by Fonoster Inc (https://fonoster.com)
 * http://github.com/fonoster/fonos
 *
 * This file is part of Project Fonos
 *
 * Licensed under the MIT License (the "License");
 * you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *    https://opensource.org/licenses/MIT
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import FuncsPB, {Func} from "./service/protos/funcs_pb";
import {DeployFuncRequest, FuncParameters} from "./types";
import fs from "fs-extra";
import path from "path";
import tar from "tar";

export const buildDeployFuncRequest = (
  request: DeployFuncRequest,
  exist: boolean
) => {
  const limits = new FuncsPB.Resource();
  const requests = new FuncsPB.Resource();

  if (request.limits) {
    limits.setCpu(request.limits.cpu);
    limits.setMemory(request.limits.memory);
  }

  if (request.requests) {
    requests.setCpu(request.requests.cpu);
    requests.setMemory(request.requests.memory);
  }

  const cfr = exist
    ? new FuncsPB.UpdateFuncRequest()
    : new FuncsPB.CreateFuncRequest();
  cfr.setName(request.name);
  cfr.setBaseImage(request.baseImage);
  cfr.setLimits(limits);
  cfr.setRequests(requests);
  return cfr;
};

export const validateFunc = (pathToFunc: string) => {
  const packagePath = path.join(pathToFunc, "package.json");
  let pInfo;

  // Expects an existing valid package.json
  const packageInfo = (p: string) => JSON.parse(`${fs.readFileSync(p)}`);

  try {
    pInfo = packageInfo(packagePath);
  } catch (err) {
    throw new Error(
      `Unable to obtain function info. Ensure package.json exists in '${pathToFunc}', and that is well formatted`
    );
  }

  if (!pInfo.main) throw new Error('Missing "main" entry at package.json');

  const mainScript = `${pathToFunc}/${pInfo.main}`;

  if (!fs.existsSync(mainScript))
    throw new Error(`Cannot find main script at "${mainScript}"`);

  if (!fs.existsSync(pathToFunc) || !fs.lstatSync(pathToFunc).isDirectory()) {
    throw new Error(`${pathToFunc} does not exist or is not a directory`);
  }

  if (!fs.existsSync(packagePath)) {
    throw new Error(`not package.json found in ${pathToFunc}`);
  }
};

export const cleanupTmpDir = (dirName: string) => {
  if (fs.existsSync(`/tmp/${dirName}`))
    fs.rmdirSync(`/tmp/${dirName}`, {recursive: true});
  if (fs.existsSync(`/tmp/${dirName}.tgz`))
    fs.unlinkSync(`/tmp/${dirName}.tgz`);
};

export const copyFuncAtTmp = async (funcPath: string, dirName: string) => {
  await fs.copy(funcPath, `/tmp/${dirName}`);
  await tar.create({file: `/tmp/${dirName}.tgz`, cwd: "/tmp"}, [dirName]);
};

export const getFuncName = (accessKeyId: string, name: string) =>
  `fn.${accessKeyId}.${name}`;

export const getImageName = (accessKeyId: string, name: string) =>
  `${process.env.DOCKER_REGISTRY_ORG}/fn.${accessKeyId}.${name}`;

export const getBuildDir = (accessKeyId: string, funcName: string) =>
  process.env.NODE_ENV === "dev"
    ? "/tmp/testfunc"
    : `${process.env.FUNCS_WORKDIR}/${accessKeyId}/${funcName}`;

export const buildFaasCreateParameters = (params: FuncParameters) => {
  const parameters = {
    service: getFuncName(params.accessKeyId, params.request.getName()),
    image: getImageName(params.accessKeyId, params.request.getName()),
    limits: {
      memory: undefined,
      cpu: undefined
    },
    requests: {
      memory: undefined,
      cpu: undefined
    },
    envProcess: "npm run start",
    labels: {
      funcName: params.request.getName()
    },
    envVars: {
      ACCESS_KEY_ID: params.accessKeyId,
      JWT_SIGNATURE: params.jwtSignature
    }
  };
  const limits = params.request.getLimits();
  const requests = params.request.getRequests();

  if (limits && limits.getMemory())
    parameters.limits.memory = limits.getMemory();
  if (limits && limits.getCpu()) parameters.limits.cpu = limits.getCpu();
  if (requests && requests.getMemory())
    parameters.requests.memory = requests.getMemory();
  if (requests && requests.getCpu())
    parameters.requests.cpu = requests.getCpu();

  return parameters;
};

export const rawFuncToFunc = (rawFunc: any) => {
  const func = new Func();
  func.setName(rawFunc.labels.funcName);
  func.setImage(rawFunc.image);
  func.setInvocationCount(rawFunc.invocationCount);
  func.setReplicas(rawFunc.replicas);
  func.setAvailableReplicas(rawFunc.availableReplicas);
  return func;
};