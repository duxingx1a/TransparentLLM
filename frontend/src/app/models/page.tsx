"use client";

import React, { useState, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  AutoComplete,
  Select,
  InputNumber,
  Typography,
  Popconfirm,
  Tag,
  message,
  Empty,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  DownloadOutlined,
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
    {
      title: "模型名称",
      dataIndex: "model_name",
      key: "model_name",
      render: (v: string) => <ModelIcon modelName={v} />,
    },
    {
      title: "提供商",
      dataIndex: "provider",
      key: "provider",
      render: (v: string) => <ProviderIcon provider={v} />,
    },
    {
      title: "类型",
      dataIndex: "model_type",
      key: "model_type",
      render: (v: string) => (
        <Tag color={modelTypeColors[v] || "default"}>{v}</Tag>
      ),
    },
    {
      title: "API 地址",
      dataIndex: "api_base",
      key: "api_base",
      ellipsis: true,
    },
    {
      title: "API Key",
      dataIndex: "decrypted_api_key",
      key: "decrypted_api_key",
      width: 220,
      render: (v: string, record: ModelConfig) => {
        const isVisible = visibleKeys.has(record.id);
        return (
          <Space>
            <code
              style={{
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              {isVisible ? v : v ? "••••••••" : "-"}
            </code>
            {v && (
              <Button
                type="text"
                size="small"
                icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => toggleKeyVisible(record.id)}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: "输入价格 (¥/1M tokens)",
      dataIndex: "input_price",
      key: "input_price",
      render: (v: number) => (v ? `¥${v}` : "-"),
    },
    {
      title: "输出价格 (¥/1M tokens)",
      dataIndex: "output_price",
      key: "output_price",
      render: (v: number) => (v ? `¥${v}` : "-"),
    },
    {
      title: "缓存价格 (¥/1M tokens)",
      dataIndex: "cache_price",
      key: "cache_price",
      render: (v: number) => (v ? `¥${v}` : "-"),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      render: (_: any, record: ModelConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此模型？"
            description="删除后不可恢复"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          模型管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            添加模型
          </Button>
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          dataSource={data?.models || []}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          locale={{
            emptyText: <Empty description="暂无模型，点击上方「添加模型」开始" />,
          }}
        />
      )}

      {/* 添加/编辑模型模态框 */}
      <Modal
        title={editingModel ? "编辑模型" : "添加模型"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
        width={680}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: "请输入提供商" }]}
            tooltip="可从已有提供商中选择（自动填充 API 地址并拉取模型列表），也可自由输入"
          >
            <AutoComplete
              options={providerOptions}
              placeholder="如 OpenAI、Qwen、DeepSeek"
              onChange={handleProviderChange}
              filterOption={() => true}
            />
          </Form.Item>

          <Form.Item
            name="model_name"
            label="模型名称"
            rules={[{ required: true, message: "请输入或选择模型名称" }]}
          >
            {providerModels.length > 0 ? (
              <AutoComplete
                options={modelNameOptions}
                placeholder="从提供商模型列表中选择，或自由输入"
                filterOption={(inputValue, option) =>
                  option!.value.toLowerCase().includes(inputValue.toLowerCase())
                }
              />
            ) : (
              <Input placeholder="如 gpt-4o, claude-3.5-sonnet" />
            )}
          </Form.Item>

          <Form.Item
            name="api_base"
            label="API 地址"
            rules={[{ required: true, message: "请输入 API 地址" }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label={editingModel ? "API Key（留空不修改）" : "API Key（选择已有提供商自动填充）"}
            rules={
              editingModel
                ? []
                : [{ required: true, message: "请选择提供商或手动输入 API Key" }]
            }
          >
            <Input
              type={formKeyVisible ? "text" : "password"}
              placeholder={editingModel ? "留空则保持原 Key 不变" : "sk-xxxx"}
              suffix={
                <Button
                  type="text"
                  size="small"
                  icon={formKeyVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => setFormKeyVisible(!formKeyVisible)}
                  tabIndex={-1}
                />
              }
            />
          </Form.Item>

          <Form.Item name="model_type" label="模型类型">
            <Select
              options={[
                { label: "对话 (Chat)", value: "chat" },
                { label: "嵌入 (Embedding)", value: "embedding" },
                { label: "图像 (Image)", value: "image" },
                { label: "音频 (Audio)", value: "audio" },
              ]}
            />
          </Form.Item>

          <Space style={{ width: "100%" }} size="middle">
            <Form.Item name="input_price" label="输入价格 (¥/1M tokens)">
              <InputNumber
                placeholder="0"
                min={0}
                step={0.01}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item name="output_price" label="输出价格 (¥/1M tokens)">
              <InputNumber
                placeholder="0"
                min={0}
                step={0.01}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item name="cache_price" label="缓存价格 (¥/1M tokens)" tooltip="缓存命中时的输入价格，默认等于输入价格">
              <InputNumber
                placeholder="0"
                min={0}
                step={0.01}
                style={{ width: 200 }}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}

