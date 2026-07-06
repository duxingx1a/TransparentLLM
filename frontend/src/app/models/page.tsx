"use client";

import React, { useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  AutoComplete,
  Select,
  InputNumber,
  Typography,
  Popconfirm,
  Tag,
  Space,
  message,
  Empty,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { modelsApi, providersApi } from "@/lib/api";
import { ModelIcon, ProviderIcon } from "@/lib/icons";
import type { ModelConfig, ModelFormData, ProviderConfig } from "@/types";

const { Title, Text } = Typography;

/** 模型类型标签颜色映射 */
const modelTypeColors: Record<string, string> = {
  chat: "blue",
  embedding: "green",
  image: "purple",
  audio: "orange",
};

export default function ModelsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [form] = Form.useForm();

  // 小眼睛状态：列表行和表单输入框
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [formKeyVisible, setFormKeyVisible] = useState(false);

  // 从提供商拉取的模型名称列表
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // 筛选状态
  const [showFilters, setShowFilters] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // 查询模型列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["models"],
    queryFn: modelsApi.list,
  });

  // 查询提供商列表（用于 AutoComplete 选项）
  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });
  const providers = providersData?.providers || [];

  // 过滤逻辑
  const allModels = data?.models || [];
  const filteredModels = allModels.filter((m: ModelConfig) => {
    if (nameFilter && !m.model_name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (typeFilter && m.model_type !== typeFilter) return false;
    return true;
  });

  // 创建模型
  const createMutation = useMutation({
    mutationFn: (values: ModelFormData) => modelsApi.create(values),
    onSuccess: () => {
      message.success("模型创建成功");
      queryClient.invalidateQueries({ queryKey: ["models"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 更新模型
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ModelFormData> }) =>
      modelsApi.update(id, data),
    onSuccess: () => {
      message.success("模型更新成功");
      queryClient.invalidateQueries({ queryKey: ["models"] });
      // 价格变更后自动刷新 Dashboard 数据
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["stats-daily"] });
      }, 1500);
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 删除模型
  const deleteMutation = useMutation({
    mutationFn: (id: string) => modelsApi.delete(id),
    onSuccess: () => {
      message.success("模型已删除");
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 从提供商拉取模型列表
  const handleFetchProviderModels = async (providerName: string) => {
    // 在 providers 列表中查找匹配的提供商
    const matched = providers.find((p) => p.name === providerName);
    if (!matched) {
      setProviderModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      const res = await providersApi.getModels(matched.id);
      setProviderModels(res.models || []);
      if (res.models && res.models.length > 0) {
        message.success(`从「${providerName}」拉取到 ${res.models.length} 个模型`);
      } else {
        message.warning(`「${providerName}」未返回模型列表`);
      }
    } catch (err: any) {
      message.error(err.message || "拉取模型列表失败");
    } finally {
      setLoadingModels(false);
    }
  };

  // 当提供商字段变化时
  const handleProviderChange = (value: string) => {
    // 查找匹配的提供商
    const matched = providers.find((p) => p.name === value);
    if (matched) {
      // 自动填充 api_base 和 api_key（从提供商获取）
      form.setFieldsValue({
        api_base: matched.api_base,
        api_key: matched.decrypted_api_key,
      });
      // 拉取模型列表
      handleFetchProviderModels(value);
    }
  };

  const handleOpenCreate = () => {
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      model_type: "chat",
      input_price: 0,
      output_price: 0,
      cache_price: 0,
    });
    setProviderModels([]);
    setFormKeyVisible(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (model: ModelConfig) => {
    setEditingModel(model);
    form.setFieldsValue({
      model_name: model.model_name,
      provider: model.provider,
      api_base: model.api_base,
      api_key: "",
      input_price: model.input_price,
      output_price: model.output_price,
      cache_price: model.cache_price,
      model_type: model.model_type,
    });
    setProviderModels([]);
    setFormKeyVisible(false);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingModel(null);
    form.resetFields();
    setProviderModels([]);
    setFormKeyVisible(false);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingModel) {
      const data: Partial<ModelFormData> = { ...values };
      if (!data.api_key) delete data.api_key;
      updateMutation.mutate({ id: editingModel.id, data });
    } else {
      createMutation.mutate(values);
    }
  };

  // 切换列表行的小眼睛
  const toggleKeyVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 构建提供商 AutoComplete 选项
  const providerOptions = providers.map((p) => ({
    value: p.name,
    label: (
      <Space>
        <Text strong>{p.name}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {p.api_base}
        </Text>
      </Space>
    ),
  }));

  // 构建模型名称 AutoComplete 选项
  const modelNameOptions = providerModels.map((m) => ({
    value: m,
    label: m,
  }));

  const columns = [
    { title: "模型名称", dataIndex: "model_name", key: "model_name", width: 180, sorter: (a: ModelConfig, b: ModelConfig) => a.model_name.localeCompare(b.model_name), render: (v: string) => <ModelIcon modelName={v} /> },
    { title: "提供商", dataIndex: "provider", key: "provider", width: 120, sorter: (a: ModelConfig, b: ModelConfig) => a.provider.localeCompare(b.provider), render: (v: string) => <ProviderIcon provider={v} /> },
    { title: "类型", dataIndex: "model_type", key: "model_type", width: 100, sorter: (a: ModelConfig, b: ModelConfig) => a.model_type.localeCompare(b.model_type), render: (v: string) => <Tag color={modelTypeColors[v] || "default"}>{v}</Tag> },
    { title: "API 地址", dataIndex: "api_base", key: "api_base", ellipsis: true, width: 220, sorter: (a: ModelConfig, b: ModelConfig) => a.api_base.localeCompare(b.api_base) },
    {
      title: "API Key", dataIndex: "decrypted_api_key", key: "decrypted_api_key", width: 160, render: (v: string, record: ModelConfig) => {
        const vis = visibleKeys.has(record.id);
        return (<Space><code style={{ maxWidth: vis ? "none" : 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: vis ? "normal" : "nowrap", display: "inline-block", wordBreak: "break-all" }}>{vis ? v : v ? "••••••••" : "-"}</code>{v && <Button type="text" size="small" icon={vis ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => toggleKeyVisible(record.id)} />}</Space>);
      }
    },
    { title: "输入价格", dataIndex: "input_price", key: "input_price", width: 80, align: "right" as const, sorter: (a: ModelConfig, b: ModelConfig) => a.input_price - b.input_price, render: (v: number) => v ? `¥${v}` : "-" },
    { title: "缓存价格", dataIndex: "cache_price", key: "cache_price", width: 80, align: "right" as const, sorter: (a: ModelConfig, b: ModelConfig) => a.cache_price - b.cache_price, render: (v: number) => v ? `¥${v}` : "-" },
    { title: "输出价格", dataIndex: "output_price", key: "output_price", width: 80, align: "right" as const, sorter: (a: ModelConfig, b: ModelConfig) => a.output_price - b.output_price, render: (v: number) => v ? `¥${v}` : "-" },
    { title: "创建时间", dataIndex: "created_at", key: "created_at", width: 140, sorter: (a: ModelConfig, b: ModelConfig) => a.created_at.localeCompare(b.created_at), render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format("MM-DD HH:mm")}</Text> },
    {
      title: "操作", key: "actions", width: 100, align: "right" as const, render: (_: any, record: ModelConfig) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" description="删除后不可恢复" onConfirm={() => deleteMutation.mutate(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <div className="w-full p-6 overflow-x-hidden box-border">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">模型管理</h1>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <Button className="flex items-center gap-1" onClick={() => setShowFilters(!showFilters)}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          过滤
        </Button>
        {(nameFilter || typeFilter) && <Button onClick={() => { setNameFilter(""); setTypeFilter(""); }}>重置过滤</Button>}
      </div>

      {showFilters && (
        <div className="grid grid-cols-3 gap-x-6 gap-y-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">模型名称</label>
            <Input placeholder="搜索模型..." value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} allowClear />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">模型类型</label>
            <Select placeholder="选择类型..." value={typeFilter || undefined} onChange={(v) => setTypeFilter(v || "")} allowClear options={[{ label: "Chat", value: "chat" }, { label: "Embedding", value: "embedding" }, { label: "Image", value: "image" }, { label: "Audio", value: "audio" }]} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow w-full max-w-full box-border">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div />
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700 whitespace-nowrap">共 {filteredModels.length} 个模型</span>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleOpenCreate}>添加模型</Button>
          </div>
        </div>
        <div className="rounded-lg custom-border overflow-x-auto w-full max-w-full box-border">
          <Table dataSource={filteredModels} columns={columns} rowKey="id" loading={isLoading} size="small" scroll={{ x: 1200 }} pagination={false} className="ant-table-compact" locale={{ emptyText: <Empty description="暂无模型" /> }} />
        </div>
      </div>

      <Modal title={editingModel ? "编辑模型" : "添加模型"} open={modalOpen} onOk={handleSubmit} onCancel={handleCloseModal} confirmLoading={createMutation.isPending || updateMutation.isPending} width={680} destroyOnHidden={false}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="provider" label="提供商" rules={[{ required: true, message: "请输入提供商" }]} tooltip="可从已有提供商中选择（自动填充 API 地址并拉取模型列表），也可自由输入">
            <AutoComplete options={providerOptions} placeholder="如 OpenAI、Qwen、DeepSeek" onChange={handleProviderChange} filterOption={() => true} />
          </Form.Item>
          <Form.Item name="model_name" label="模型名称" rules={[{ required: true, message: "请输入或选择模型名称" }]}>
            {providerModels.length > 0 ? <AutoComplete options={modelNameOptions} placeholder="从提供商模型列表中选择，或自由输入" filterOption={(v, o) => o!.value.toLowerCase().includes(v.toLowerCase())} /> : <Input placeholder="如 gpt-4o, claude-3.5-sonnet" />}
          </Form.Item>
          <Form.Item name="api_base" label="API 地址" rules={[{ required: true, message: "请输入 API 地址" }]}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="api_key" label={editingModel ? "API Key（留空不修改）" : "API Key（选择已有提供商自动填充）"} rules={editingModel ? [] : [{ required: true, message: "请选择提供商或手动输入 API Key" }]}>
            <Input type={formKeyVisible ? "text" : "password"} placeholder={editingModel ? "留空则保持原 Key 不变" : "sk-xxxx"} suffix={<Button type="text" size="small" icon={formKeyVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setFormKeyVisible(!formKeyVisible)} tabIndex={-1} />} />
          </Form.Item>
          <Form.Item name="model_type" label="模型类型">
            <Select options={[{ label: "对话 (Chat)", value: "chat" }, { label: "嵌入 (Embedding)", value: "embedding" }, { label: "图像 (Image)", value: "image" }, { label: "音频 (Audio)", value: "audio" }]} />
          </Form.Item>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="input_price" label="输入价格 (¥/1M)"><InputNumber placeholder="0" min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="output_price" label="输出价格 (¥/1M)"><InputNumber placeholder="0" min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="cache_price" label="缓存价格 (¥/1M)" tooltip="缓存命中时的输入价格"><InputNumber placeholder="0" min={0} step={0.01} style={{ width: "100%" }} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

